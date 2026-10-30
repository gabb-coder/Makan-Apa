-- Room membership for anonymous auth (step A of 2).
--
-- Each phone signs in with a Supabase anonymous account. room_access links that account to a
-- member of a room; row-level security then only shows a room's data to its own members.
-- Joining and creating go through functions, so rooms can't be listed or read by code alone.
--
-- This step only adds things. The old "room code is the password" policies stay until the new
-- app is deployed; step B (20261030050000_lock_down.sql) removes them.

create table public.room_access (
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index on public.room_access (user_id);
create index on public.room_access (member_id);
alter table public.room_access enable row level security;
create policy "own access" on public.room_access for select to authenticated using (user_id = (select auth.uid()));
grant select on public.room_access to authenticated;

-- Helpers for policies. Security definer so they can read room_access without recursion.
create function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from room_access where room_id = p_room_id and user_id = auth.uid());
$$;

create function public.my_member_id(p_room_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select member_id from room_access where room_id = p_room_id and user_id = auth.uid();
$$;

-- The host is whoever created the room: the first member to join.
create function public.room_host_id(p_room_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from members where room_id = p_room_id order by created_at, id limit 1;
$$;

create function public.entry_room_id(p_day_entry_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select room_id from day_entries where id = p_day_entry_id;
$$;

-- Member policies (only for signed-in members; the anon key gets nothing once step B lands).
create policy "members read room" on rooms for select to authenticated using (is_room_member(id));
create policy "members update room" on rooms for update to authenticated using (is_room_member(id)) with check (is_room_member(id));
create policy "host deletes room" on rooms for delete to authenticated using (my_member_id(id) = room_host_id(id));

create policy "members read members" on members for select to authenticated using (is_room_member(room_id));
create policy "members update members" on members for update to authenticated
  using (is_room_member(room_id)) with check (is_room_member(room_id));
create policy "host removes members" on members for delete to authenticated
  using (my_member_id(room_id) = room_host_id(room_id) and id <> my_member_id(room_id));

create policy "members use foods" on food_options for all to authenticated
  using (is_room_member(room_id)) with check (is_room_member(room_id));

create policy "members use days" on day_entries for all to authenticated
  using (is_room_member(room_id)) with check (is_room_member(room_id));

create policy "members read vetoes" on vetoes for select to authenticated using (is_room_member(entry_room_id(day_entry_id)));
create policy "members veto as themselves" on vetoes for insert to authenticated
  with check (member_id = my_member_id(entry_room_id(day_entry_id)));
create policy "members undo own vetoes" on vetoes for delete to authenticated
  using (member_id = my_member_id(entry_room_id(day_entry_id)));

create policy "members read picks" on secret_picks for select to authenticated using (is_room_member(entry_room_id(day_entry_id)));
create policy "members pick as themselves" on secret_picks for insert to authenticated
  with check (member_id = my_member_id(entry_room_id(day_entry_id)));
create policy "members change own pick" on secret_picks for update to authenticated
  using (member_id = my_member_id(entry_room_id(day_entry_id)))
  with check (member_id = my_member_id(entry_room_id(day_entry_id)));

-- Joining, creating, reclaiming and leaving.
create function public.room_code()
returns text
language sql
volatile
as $$
  -- No 0/O or 1/I/L, so codes are easy to read out loud.
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 31) + 1, 1), '')
  from (select extensions.gen_random_bytes(6) as b) r, generate_series(0, 5) i;
$$;

-- Adds `p_name` to the room, or continues as the member with that name. Returns the member.
create function public.add_or_rejoin_member(p_room_id uuid, p_name text, out member members, out rejoined boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  palette text[] := array['#CC3F17', '#2F6FD6', '#2F8F5B', '#8A3FC4', '#B7791F', '#1E8C8C', '#C2185B', '#4A4A50'];
  next_color text;
begin
  select * into member from members
  where room_id = p_room_id and lower(trim(name)) = lower(trim(p_name))
  limit 1;
  rejoined := found;
  if not found then
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
    returning * into member;
  end if;
  insert into room_access (room_id, user_id, member_id) values (p_room_id, auth.uid(), member.id)
  on conflict (room_id, user_id) do update set member_id = excluded.member_id;
end;
$$;
revoke execute on function public.add_or_rejoin_member(uuid, text) from public, anon, authenticated;

create function public.create_room(p_name text, p_timezone text, p_rotation_start date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_room rooms;
  result record;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Add your name first' using errcode = '22023'; end if;
  for attempt in 1..10 loop
    begin
      insert into rooms (code, timezone, rotation_start) values (room_code(), p_timezone, p_rotation_start) returning * into new_room;
      exit;
    exception when unique_violation then
      if attempt = 10 then raise; end if;
    end;
  end loop;
  select * into result from add_or_rejoin_member(new_room.id, p_name);
  return jsonb_build_object('room', to_jsonb(new_room), 'member', to_jsonb(result.member), 'rejoined', false);
end;
$$;

create function public.join_room(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target rooms;
  result record;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Add your name first' using errcode = '22023'; end if;
  select * into target from rooms where code = upper(trim(p_code));
  if not found then return null; end if;
  select * into result from add_or_rejoin_member(target.id, p_name);
  return jsonb_build_object('room', to_jsonb(target), 'member', to_jsonb(result.member), 'rejoined', result.rejoined);
end;
$$;

-- Phones from before accounts existed remember their room and member ids (unguessable UUIDs);
-- this lets them carry on as that member without rejoining.
create function public.claim_member(p_room_id uuid, p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  if not exists (select 1 from members where id = p_member_id and room_id = p_room_id) then return false; end if;
  insert into room_access (room_id, user_id, member_id) values (p_room_id, auth.uid(), p_member_id)
  on conflict (room_id, user_id) do update set member_id = excluded.member_id;
  return true;
end;
$$;

create function public.leave_room(p_room_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from room_access where room_id = p_room_id and user_id = auth.uid();
$$;

revoke execute on function public.create_room(text, text, date) from public, anon;
revoke execute on function public.join_room(text, text) from public, anon;
revoke execute on function public.claim_member(uuid, uuid) from public, anon;
revoke execute on function public.leave_room(uuid) from public, anon;
grant execute on function public.create_room(text, text, date) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.claim_member(uuid, uuid) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;

-- Reminders: only for a member this phone actually is.
create or replace function public.subscribe_push(p_member_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_remind_hour int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from room_access where member_id = p_member_id and user_id = auth.uid()) then
    raise exception 'Not a member of this room' using errcode = '42501';
  end if;
  insert into push_subscriptions (room_id, member_id, endpoint, p256dh, auth, remind_hour)
  select m.room_id, m.id, p_endpoint, p_p256dh, p_auth, p_remind_hour from members m where m.id = p_member_id
  on conflict (endpoint) do update
    set room_id = excluded.room_id, member_id = excluded.member_id, p256dh = excluded.p256dh,
        auth = excluded.auth, remind_hour = excluded.remind_hour;
end;
$$;
