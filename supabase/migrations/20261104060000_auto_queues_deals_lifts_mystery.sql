-- Auto-decide, queue reports, deals, lifts and mystery lunch.

-- 1. Auto-decide ---------------------------------------------------------------------------------
-- If the decider hasn't picked by 12:00 (7pm for dinner) the wheel picks for them; they get a
-- nudge at 11:30 (6:30pm). Done by the send-reminders Edge Function every 5 minutes.
alter table public.rooms add column auto_decide boolean not null default true;
-- The wheel picked it because nobody had, so the alert and the card say so.
alter table public.day_entries add column auto_picked boolean not null default false;

-- What the function has done for each meal, so it nudges and picks once. Service role only.
create table public.auto_decisions (
  room_id uuid not null references rooms(id) on delete cascade,
  entry_date date not null,
  meal text not null check (meal in ('lunch', 'dinner')),
  nudged_at timestamptz,
  decided_at timestamptz,
  primary key (room_id, entry_date, meal)
);
alter table public.auto_decisions enable row level security;

-- Only the host turns it off or on, like the other rules.
create or replace function private.guard_room_name()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.name is distinct from old.name
      or new.host_id is distinct from old.host_id
      or new.locked is distinct from old.locked
      or new.kitty_keeper is distinct from old.kitty_keeper
      or new.meals is distinct from old.meals
      or new.decision_mode is distinct from old.decision_mode
      or new.veto_limit is distinct from old.veto_limit
      or new.fixed_days is distinct from old.fixed_days
      or new.rotation_start is distinct from old.rotation_start
      or new.timezone is distinct from old.timezone
      or new.eat_days is distinct from old.eat_days
      or new.skip_holidays is distinct from old.skip_holidays
      or new.rotation_offset is distinct from old.rotation_offset
      or new.auto_decide is distinct from old.auto_decide)
     and my_member_id(new.id) is distinct from room_host_id(new.id) then
    raise exception 'Only the host can change that' using errcode = '42501';
  end if;
  if new.host_id is distinct from old.host_id and new.host_id is not null
     and not exists (select 1 from members where id = new.host_id and room_id = new.id and left_at is null) then
    raise exception 'The new host has to be in the room' using errcode = '22023';
  end if;
  if new.kitty_keeper is distinct from old.kitty_keeper and new.kitty_keeper is not null
     and not exists (select 1 from members where id = new.kitty_keeper and room_id = new.id and left_at is null) then
    raise exception 'The kitty keeper has to be in the room' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- 2. Live queue reports ---------------------------------------------------------------------------
-- "No queue / short / long" at a place, from anyone using the app (not just your room), so a
-- report is useful to everyone heading there. Reports show for 30 minutes; nobody sees who sent one.
create table public.queue_reports (
  id uuid primary key default gen_random_uuid(),
  spot_id text not null check (char_length(spot_id) between 1 and 80),
  level text not null check (level in ('none', 'short', 'long')),
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index queue_reports_recent on public.queue_reports (created_at desc);
alter table public.queue_reports enable row level security;
create policy "anyone sees recent queue reports" on public.queue_reports for select to authenticated
  using (created_at > now() - interval '45 minutes');
create policy "people report as themselves" on public.queue_reports for insert to authenticated
  with check (user_id = auth.uid());
grant select (id, spot_id, level, created_at) on public.queue_reports to authenticated;
grant insert (spot_id, level) on public.queue_reports to authenticated;

-- One report per person per place every 5 minutes, so nobody can flood a place.
create function private.guard_queue_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from queue_reports where user_id = new.user_id and spot_id = new.spot_id and created_at > now() - interval '5 minutes') then
    raise exception 'You reported this place a moment ago' using errcode = '22023';
  end if;
  delete from queue_reports where created_at < now() - interval '1 day';
  return new;
end;
$$;
revoke execute on function private.guard_queue_report() from public, anon, authenticated;
create trigger guard_queue_report before insert on public.queue_reports
  for each row execute function private.guard_queue_report();

-- 3. Deals -----------------------------------------------------------------------------------------
-- Promos a member spotted ("1-for-1 Tealive till Friday"), optionally at one of the app's places.
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  spot_id text check (char_length(spot_id) <= 80),
  title text not null check (char_length(trim(title)) between 1 and 80),
  ends_on date not null,
  created_at timestamptz not null default now()
);
create index deals_room on public.deals (room_id, ends_on);
alter table public.deals enable row level security;
create policy "members see deals" on public.deals for select to authenticated using (private.is_room_member(room_id));
create policy "members post deals as themselves" on public.deals for insert to authenticated
  with check (member_id = private.my_member_id(room_id));
create policy "poster or host removes deals" on public.deals for delete to authenticated
  using (member_id = private.my_member_id(room_id) or private.my_member_id(room_id) = private.room_host_id(room_id));
grant select, insert, delete on public.deals to authenticated;

-- 4. Lifts -----------------------------------------------------------------------------------------
-- Someone driving to a meet-up (a meal's or an event's) and the seats they have.
create table public.lifts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  day_entry_id uuid references day_entries(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  driver_id uuid not null references members(id) on delete cascade,
  seats smallint not null check (seats between 1 and 7),
  created_at timestamptz not null default now(),
  check (num_nonnulls(day_entry_id, event_id) = 1),
  unique (day_entry_id, driver_id),
  unique (event_id, driver_id)
);
alter table public.lifts enable row level security;
create policy "members see lifts" on public.lifts for select to authenticated using (private.is_room_member(room_id));
create policy "drivers offer lifts as themselves" on public.lifts for insert to authenticated
  with check (driver_id = private.my_member_id(room_id)
    and (day_entry_id is null or exists (select 1 from day_entries d where d.id = day_entry_id and d.room_id = lifts.room_id))
    and (event_id is null or private.event_room_id(event_id) = room_id));
create policy "drivers change their seats" on public.lifts for update to authenticated
  using (driver_id = private.my_member_id(room_id)) with check (driver_id = private.my_member_id(room_id));
create policy "drivers call off lifts" on public.lifts for delete to authenticated
  using (driver_id = private.my_member_id(room_id));
grant select, insert, update (seats), delete on public.lifts to authenticated;

create function private.lift_room_id(p_lift_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select room_id from lifts where id = p_lift_id;
$$;
revoke execute on function private.lift_room_id(uuid) from public, anon;
grant execute on function private.lift_room_id(uuid) to authenticated;

create table public.lift_riders (
  lift_id uuid not null references lifts(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lift_id, member_id)
);
alter table public.lift_riders enable row level security;
create policy "members see riders" on public.lift_riders for select to authenticated
  using (private.is_room_member(private.lift_room_id(lift_id)));
create policy "riders take a seat as themselves" on public.lift_riders for insert to authenticated
  with check (member_id = private.my_member_id(private.lift_room_id(lift_id)));
create policy "riders give up their seat, drivers drop riders" on public.lift_riders for delete to authenticated
  using (member_id = private.my_member_id(private.lift_room_id(lift_id))
    or exists (select 1 from lifts l where l.id = lift_id and l.driver_id = private.my_member_id(l.room_id)));
grant select, insert, delete on public.lift_riders to authenticated;

-- No more riders than seats.
create function private.guard_lift_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from lift_riders where lift_id = new.lift_id) >= (select seats from lifts where id = new.lift_id) then
    raise exception 'That car is full' using errcode = '22023';
  end if;
  if exists (select 1 from lifts where id = new.lift_id and driver_id = new.member_id) then
    raise exception 'You’re driving this one' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_lift_seats() from public, anon, authenticated;
create trigger guard_lift_seats before insert on public.lift_riders
  for each row execute function private.guard_lift_seats();

-- 5. Mystery lunch ---------------------------------------------------------------------------------
-- The decider's pick stays hidden from everyone else until they reveal it or the meet-up time
-- comes (the app hides it; it's a game, not a secret). It skips vetoes, so it's agreed at once.
alter table public.day_entries
  add column mystery boolean not null default false,
  add column mystery_revealed boolean not null default false;

alter publication supabase_realtime add table public.deals, public.lifts, public.lift_riders;
