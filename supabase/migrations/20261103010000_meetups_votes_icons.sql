-- Meet-ups, fixed days, quick votes, room icons, DuitNow QR codes, "what's new", and the alerts
-- that go with them.

-- 1. Meet-up time and place, and when the day last changed ------------------------------------
alter table public.day_entries
  add column meet_at timestamptz,
  add column meet_place text check (char_length(meet_place) <= 60),
  add column meet_alerted boolean not null default false,
  add column updated_at timestamptz not null default now();

create function private.touch_day_entry()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  -- A new meet-up time gets its own "leaving soon" alert.
  if new.meet_at is distinct from old.meet_at then new.meet_alerted = false; end if;
  return new;
end;
$$;
create trigger touch_day_entry before update on public.day_entries
  for each row execute function private.touch_day_entry();

-- 2. Quick votes ---------------------------------------------------------------------------------
-- The decider puts up 2 or 3 options; everyone picks one before the deadline.
alter table public.day_entries
  add column vote_options text[] check (vote_options is null or cardinality(vote_options) between 2 and 3),
  add column vote_ends_at timestamptz;

create table public.votes (
  day_entry_id uuid not null references day_entries(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  choice smallint not null check (choice between 0 and 2),
  created_at timestamptz not null default now(),
  primary key (day_entry_id, member_id)
);
alter table public.votes enable row level security;
create policy "members read votes" on public.votes for select to authenticated
  using (private.is_room_member(private.entry_room_id(day_entry_id)));
create policy "members vote as themselves" on public.votes for insert to authenticated
  with check (member_id = private.my_member_id(private.entry_room_id(day_entry_id)));
create policy "members change own vote" on public.votes for update to authenticated
  using (member_id = private.my_member_id(private.entry_room_id(day_entry_id)))
  with check (member_id = private.my_member_id(private.entry_room_id(day_entry_id)));
create policy "members take back own vote" on public.votes for delete to authenticated
  using (member_id = private.my_member_id(private.entry_room_id(day_entry_id)));
grant select, insert, update, delete on public.votes to authenticated;

-- 3. Room icons and fixed days --------------------------------------------------------------------
-- fixed_days maps a weekday (0 Sunday … 6 Saturday) to a food, e.g. {"5": "Mamak"}: that day is
-- decided on its own and nobody has to choose.
alter table public.rooms
  add column emoji text check (char_length(emoji) <= 16),
  add column color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  add column fixed_days jsonb not null default '{}'::jsonb check (jsonb_typeof(fixed_days) = 'object');

-- 4. DuitNow QR codes -------------------------------------------------------------------------
-- A photo of your QR in the receipts bucket, under each room's folder (so only that room sees it).
alter table public.members add column pay_qr_path text check (char_length(pay_qr_path) <= 200);

create or replace function private.own_pay_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.pay_duitnow is distinct from old.pay_duitnow or new.pay_bank is distinct from old.pay_bank
      or new.pay_qr_path is distinct from old.pay_qr_path)
     and not exists (select 1 from room_access where member_id = new.id and user_id = auth.uid()) then
    raise exception 'Only % can change their payment details.', old.name;
  end if;
  return new;
end;
$$;

alter publication supabase_realtime add table public.votes;

-- 5. Alerts --------------------------------------------------------------------------------------
create or replace function private.on_day_entry_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'proposed' and (old.status <> 'proposed' or new.food_option_id is distinct from old.food_option_id
      or new.custom_food is distinct from old.custom_food) then
    perform private.notify_event('proposed', new.room_id, new.id);
  elsif new.status = 'accepted' and old.status <> 'accepted' then
    perform private.notify_event('decided', new.room_id, new.id);
  end if;
  if new.vote_options is not null and new.vote_options is distinct from old.vote_options then
    perform private.notify_event('vote', new.room_id, new.id);
  end if;
  if new.meet_at is not null and (new.meet_at is distinct from old.meet_at or new.meet_place is distinct from old.meet_place) then
    perform private.notify_event('meet', new.room_id, new.id);
  end if;
  return null;
end;
$$;

-- Someone running late tells the others.
create function private.on_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'late' and (tg_op = 'INSERT' or old.status <> 'late') and new.entry_date >= current_date - 1 then
    perform private.notify_event('late', new.room_id, new.member_id);
  end if;
  return null;
end;
$$;
revoke execute on function private.on_attendance_change() from public, anon, authenticated;
create trigger notify_attendance after insert or update on public.attendance
  for each row execute function private.on_attendance_change();

-- "Leaving in 10 minutes" needs a finer clock than every 15 minutes.
select cron.alter_job((select jobid from cron.job where jobname = 'send-reminders'), schedule := '*/5 * * * *');
