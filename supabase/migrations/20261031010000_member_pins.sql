-- PINs, so knowing the room code isn't enough to become someone else.
--
-- Joining with a name that's already in the room used to continue as that member. Now that only
-- works when:
--   * the member has a PIN and you enter it (5 wrong tries lock it for 15 minutes), or
--   * the member has no PIN and isn't signed in on any phone (e.g. they left on this phone), or
--   * the host has just let them back in (for 15 minutes, e.g. a lost phone).

create table private.member_security (
  member_id uuid primary key references public.members(id) on delete cascade,
  pin_hash text,
  failed_tries int not null default 0,
  locked_until timestamptz,
  rejoin_until timestamptz
);
revoke all on private.member_security from public, anon, authenticated;

-- Which members of a room have a PIN (not the PINs themselves). Members only.
create function public.room_pins(p_room_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public, private
as $$
  select s.member_id from private.member_security s
  join members m on m.id = s.member_id
  where m.room_id = p_room_id and s.pin_hash is not null and private.is_room_member(p_room_id);
$$;

-- Set, change or (with null) remove your own PIN.
create function public.set_my_pin(p_room_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  me uuid := private.my_member_id(p_room_id);
begin
  if me is null then raise exception 'Not a member of this room' using errcode = '42501'; end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then raise exception 'PINs are 4 digits' using errcode = '22023'; end if;
  insert into private.member_security (member_id, pin_hash)
  values (me, case when p_pin is null then null else crypt(p_pin, gen_salt('bf', 8)) end)
  on conflict (member_id) do update
    set pin_hash = excluded.pin_hash, failed_tries = 0, locked_until = null;
end;
$$;

-- Host only: let a member rejoin by name on a new phone for 15 minutes, and clear their PIN.
create function public.let_member_rejoin(p_room_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if private.my_member_id(p_room_id) is distinct from private.room_host_id(p_room_id) then
    raise exception 'Only the host can do this' using errcode = '42501';
  end if;
  if not exists (select 1 from members where id = p_member_id and room_id = p_room_id) then
    raise exception 'No such member' using errcode = '22023';
  end if;
  insert into private.member_security (member_id, pin_hash, rejoin_until)
  values (p_member_id, null, now() + interval '15 minutes')
  on conflict (member_id) do update
    set pin_hash = null, failed_tries = 0, locked_until = null, rejoin_until = excluded.rejoin_until;
end;
$$;

-- join_room gains a PIN. Instead of raising (which would undo the failed-try count), problems
-- come back as {"error": ...}: pin_required, wrong_pin (with tries_left), pin_locked, name_in_use.
drop function public.join_room(text, text);

create function public.join_room(p_code text, p_name text, p_pin text default null)
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

  select * into result from add_or_rejoin_member(target.id, p_name);
  return jsonb_build_object('room', to_jsonb(target), 'member', to_jsonb(result.member), 'rejoined', result.rejoined);
end;
$$;

revoke execute on function public.room_pins(uuid) from public, anon;
revoke execute on function public.set_my_pin(uuid, text) from public, anon;
revoke execute on function public.let_member_rejoin(uuid, uuid) from public, anon;
revoke execute on function public.join_room(text, text, text) from public, anon;
grant execute on function public.room_pins(uuid) to authenticated;
grant execute on function public.set_my_pin(uuid, text) to authenticated;
grant execute on function public.let_member_rejoin(uuid, uuid) to authenticated;
grant execute on function public.join_room(text, text, text) to authenticated;
