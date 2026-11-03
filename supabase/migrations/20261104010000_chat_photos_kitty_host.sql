-- Room chat and reactions, notes on places, meal photos, the group kitty, and host controls
-- (remove someone, hand over host, lock the room so new people need letting in).

-- 1. Room chat ------------------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index messages_room_time on public.messages (room_id, created_at desc);
alter table public.messages enable row level security;
create policy "members read chat" on public.messages for select to authenticated
  using (private.is_room_member(room_id));
create policy "members write as themselves" on public.messages for insert to authenticated
  with check (member_id = private.my_member_id(room_id));
create policy "members delete own messages" on public.messages for delete to authenticated
  using (member_id = private.my_member_id(room_id));
grant select, insert, delete on public.messages to authenticated;

-- 2. Reactions on a day's pick --------------------------------------------------------------------
create table public.reactions (
  day_entry_id uuid not null references day_entries(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '👍', '😋', '🤔', '😴')),
  created_at timestamptz not null default now(),
  primary key (day_entry_id, member_id, emoji)
);
alter table public.reactions enable row level security;
create policy "members read reactions" on public.reactions for select to authenticated
  using (private.is_room_member(private.entry_room_id(day_entry_id)));
create policy "members react as themselves" on public.reactions for insert to authenticated
  with check (member_id = private.my_member_id(private.entry_room_id(day_entry_id)));
create policy "members take back own reactions" on public.reactions for delete to authenticated
  using (member_id = private.my_member_id(private.entry_room_id(day_entry_id)));
grant select, insert, delete on public.reactions to authenticated;

-- 3. Notes on places ("order the dry version", "cash only") ---------------------------------------
-- spot_id is the place's id in the app: a built-in Sunway spot, or room_spots.id as text.
create table public.place_notes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  spot_id text not null check (char_length(spot_id) between 1 and 80),
  member_id uuid not null references members(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index place_notes_room on public.place_notes (room_id, spot_id);
alter table public.place_notes enable row level security;
create policy "members read notes" on public.place_notes for select to authenticated
  using (private.is_room_member(room_id));
create policy "members write notes as themselves" on public.place_notes for insert to authenticated
  with check (member_id = private.my_member_id(room_id));
create policy "authors and host delete notes" on public.place_notes for delete to authenticated
  using (member_id = private.my_member_id(room_id) or private.my_member_id(room_id) = private.room_host_id(room_id));
grant select, insert, delete on public.place_notes to authenticated;

-- 4. Meal photos ----------------------------------------------------------------------------------
-- The files go in the private receipts bucket under <room id>/meals/, so only the room sees them.
create table public.meal_photos (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  day_entry_id uuid not null references day_entries(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  path text not null check (char_length(path) <= 200),
  created_at timestamptz not null default now()
);
create index meal_photos_room on public.meal_photos (room_id, created_at desc);
alter table public.meal_photos enable row level security;
create policy "members see photos" on public.meal_photos for select to authenticated
  using (private.is_room_member(room_id));
create policy "members add photos as themselves" on public.meal_photos for insert to authenticated
  with check (member_id = private.my_member_id(room_id) and private.entry_room_id(day_entry_id) = room_id);
create policy "authors and host remove photos" on public.meal_photos for delete to authenticated
  using (member_id = private.my_member_id(room_id) or private.my_member_id(room_id) = private.room_host_id(room_id));
grant select, insert, delete on public.meal_photos to authenticated;

-- 5. Group kitty ----------------------------------------------------------------------------------
-- Everyone tops up a shared pool held by the keeper; bills marked from_kitty come out of it and
-- create no debts. Each person's kitty balance is what they put in minus their shares.
alter table public.rooms add column kitty_keeper uuid references members(id) on delete set null;
alter table public.meal_bills add column from_kitty boolean not null default false;

create table public.kitty_topups (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  amount_cents integer not null check (amount_cents between 1 and 10000000),
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index kitty_topups_room on public.kitty_topups (room_id, created_at desc);
alter table public.kitty_topups enable row level security;
create policy "members see the kitty" on public.kitty_topups for select to authenticated
  using (private.is_room_member(room_id));
create policy "members record top-ups" on public.kitty_topups for insert to authenticated
  with check (private.is_room_member(room_id) and created_by = private.my_member_id(room_id)
    and exists (select 1 from members m where m.id = member_id and m.room_id = kitty_topups.room_id));
create policy "recorder, keeper or host undo top-ups" on public.kitty_topups for delete to authenticated
  using (created_by = private.my_member_id(room_id)
    or private.my_member_id(room_id) = private.room_host_id(room_id)
    or private.my_member_id(room_id) = (select kitty_keeper from rooms r where r.id = room_id));
grant select, insert, delete on public.kitty_topups to authenticated;

-- 6. Host controls --------------------------------------------------------------------------------
-- host_id: who the host handed over to. Without one (or once they leave) it's the longest-standing
-- member, as before. locked: new people ask to join and the host lets them in.
alter table public.rooms
  add column host_id uuid references members(id) on delete set null,
  add column locked boolean not null default false;
-- Set when the host removes someone: they can't just join again by name.
alter table public.members add column removed_at timestamptz;

create or replace function private.room_host_id(p_room_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.id from rooms r join members m on m.id = r.host_id where r.id = p_room_id and m.left_at is null),
    (select id from members where room_id = p_room_id and left_at is null order by created_at, id limit 1)
  );
$$;

-- Only the host renames the room, hands over host, locks it or chooses the kitty keeper's
-- replacement; members can still change the other settings.
drop trigger guard_room_name on public.rooms;
create or replace function private.guard_room_name()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.name is distinct from old.name or new.host_id is distinct from old.host_id or new.locked is distinct from old.locked)
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
create trigger guard_room_name before update on public.rooms
  for each row execute function private.guard_room_name();

-- The host takes someone out of the room. They're kept for history and money, like leaving.
create function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target members;
begin
  select * into target from members where id = p_member_id;
  if not found then raise exception 'They''re not in this room' using errcode = '22023'; end if;
  if my_member_id(target.room_id) is distinct from room_host_id(target.room_id) then
    raise exception 'Only the host can remove people from the room.' using errcode = '42501';
  end if;
  if target.id = my_member_id(target.room_id) then
    raise exception 'To leave, use “Leave room on this phone”.' using errcode = '22023';
  end if;
  update members set left_at = now(), removed_at = now() where id = target.id;
  delete from room_access where member_id = target.id;
  delete from push_subscriptions where member_id = target.id;
  update rooms set kitty_keeper = null where id = target.room_id and kitty_keeper = target.id;
end;
$$;
revoke execute on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;

-- Asking to join a locked room (or coming back after being removed).
create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 24),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);
alter table public.join_requests enable row level security;
create policy "host and asker see requests" on public.join_requests for select to authenticated
  using (user_id = auth.uid() or private.my_member_id(room_id) = private.room_host_id(room_id));
grant select on public.join_requests to authenticated;

-- Adds (or brings back) someone in a room for a given phone: add_or_rejoin_member for the host
-- letting someone else in.
create function private.admit_member(p_room_id uuid, p_name text, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  palette text[] := array['#CC3F17', '#2F6FD6', '#2F8F5B', '#8A3FC4', '#B7791F', '#1E8C8C', '#C2185B', '#4A4A50'];
  next_color text;
  mid uuid;
begin
  select id into mid from members where room_id = p_room_id and lower(trim(name)) = lower(trim(p_name)) limit 1;
  if mid is null then
    select c into next_color from unnest(palette) with ordinality as p(c, n)
    where upper(c) not in (select upper(color) from members where room_id = p_room_id)
    order by n limit 1;
    insert into members (room_id, name, color, sort_order)
    values (
      p_room_id,
      trim(p_name),
      coalesce(next_color, palette[1 + (select count(*) from members where room_id = p_room_id)::int % 8]),
      coalesce((select max(sort_order) + 1 from members where room_id = p_room_id), 0)
    )
    returning id into mid;
  else
    update members set removed_at = null, left_at = null where id = mid;
  end if;
  insert into room_access (room_id, user_id, member_id) values (p_room_id, p_user_id, mid)
  on conflict (room_id, user_id) do update set member_id = excluded.member_id;
  return mid;
end;
$$;
revoke execute on function private.admit_member(uuid, text, uuid) from public, anon, authenticated;

create function public.answer_join_request(p_request_id uuid, p_let_in boolean)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  req join_requests;
begin
  select * into req from join_requests where id = p_request_id;
  if not found then raise exception 'That request is gone' using errcode = '22023'; end if;
  if my_member_id(req.room_id) is distinct from room_host_id(req.room_id) then
    raise exception 'Only the host can let people in.' using errcode = '42501';
  end if;
  if p_let_in then
    perform private.admit_member(req.room_id, req.name, req.user_id);
    update join_requests set status = 'approved' where id = req.id;
  else
    update join_requests set status = 'declined' where id = req.id;
  end if;
end;
$$;
revoke execute on function public.answer_join_request(uuid, boolean) from public, anon;
grant execute on function public.answer_join_request(uuid, boolean) to authenticated;

-- join_room: as before (PINs and all), but a locked room, or someone the host removed, gets a
-- request for the host instead of walking in. People already in the room on this phone, and
-- members coming back on a new phone, still go straight in.
create or replace function public.join_room(p_code text, p_name text, p_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  target rooms;
  existing members;
  sec private.member_security;
  result record;
  req join_requests;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Add your name first' using errcode = '22023'; end if;
  select * into target from rooms where code = upper(trim(p_code));
  if not found then return null; end if;

  select * into existing from members
  where room_id = target.id and lower(trim(name)) = lower(trim(p_name))
  limit 1;

  if found and not exists (select 1 from room_access where member_id = existing.id and user_id = auth.uid()) then
    select * into sec from private.member_security where member_id = existing.id;
    if sec.pin_hash is not null then
      if sec.locked_until > now() then
        return jsonb_build_object('error', 'pin_locked', 'name', existing.name);
      end if;
      if p_pin is null or p_pin = '' then
        return jsonb_build_object('error', 'pin_required', 'name', existing.name);
      end if;
      if crypt(p_pin, sec.pin_hash) <> sec.pin_hash then
        update private.member_security
          set failed_tries = failed_tries + 1,
              locked_until = case when failed_tries + 1 >= 5 then now() + interval '15 minutes' else null end
          where member_id = existing.id
          returning * into sec;
        if sec.locked_until is not null then
          update private.member_security set failed_tries = 0 where member_id = existing.id;
          return jsonb_build_object('error', 'pin_locked', 'name', existing.name);
        end if;
        return jsonb_build_object('error', 'wrong_pin', 'name', existing.name, 'tries_left', 5 - sec.failed_tries);
      end if;
      update private.member_security set failed_tries = 0, locked_until = null where member_id = existing.id;
    elsif coalesce(sec.rejoin_until, '-infinity') < now()
      and exists (select 1 from room_access where member_id = existing.id) then
      -- Someone is using that name on another phone and it has no PIN.
      return jsonb_build_object('error', 'name_in_use', 'name', existing.name);
    end if;
    update private.member_security set rejoin_until = null where member_id = existing.id;
  end if;

  if not exists (select 1 from room_access where room_id = target.id and user_id = auth.uid())
     and ((existing.id is not null and existing.removed_at is not null)
       or (target.locked and (existing.id is null or existing.left_at is not null))) then
    insert into join_requests (room_id, user_id, name)
    values (target.id, auth.uid(), trim(p_name))
    on conflict (room_id, user_id) do update set name = excluded.name, status = 'pending', created_at = now()
    returning * into req;
    perform private.notify_event('join', target.id, req.id);
    return jsonb_build_object('error', 'approval_needed', 'request_id', req.id, 'room_name', coalesce(target.name, target.code));
  end if;

  select * into result from add_or_rejoin_member(target.id, p_name);
  update join_requests set status = 'approved' where room_id = target.id and user_id = auth.uid() and status = 'pending';
  return jsonb_build_object('room', to_jsonb(target), 'member', to_jsonb(result.member), 'rejoined', result.rejoined);
end;
$$;

-- 7. Alerts: chat messages, and join requests for the host ----------------------------------------
create function private.on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.notify_event('chat', new.room_id, new.id);
  return null;
end;
$$;
revoke execute on function private.on_message() from public, anon, authenticated;
create trigger notify_message after insert on public.messages
  for each row execute function private.on_message();

alter publication supabase_realtime add table public.messages, public.reactions, public.meal_photos,
  public.kitty_topups, public.join_requests, public.place_notes;
