-- Rooms can have a name ("Sunway lunch gang"), set when created and changed by the host.

alter table rooms add column name text check (name is null or char_length(name) between 1 and 40);

-- Members can change other room settings, but only the host renames the room.
-- search_path covers both schemas because the policy helpers move to private in lock_down.
create function private.guard_room_name()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.name is distinct from old.name
     and auth.uid() is not null
     and my_member_id(new.id) is distinct from room_host_id(new.id) then
    raise exception 'Only the host can rename the room' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_room_name before update of name on rooms
  for each row execute function private.guard_room_name();

-- create_room gains an optional room name.
drop function public.create_room(text, text, date);

create function public.create_room(p_name text, p_timezone text, p_rotation_start date, p_room_name text default null)
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
      insert into rooms (code, timezone, rotation_start, name)
      values (room_code(), p_timezone, p_rotation_start, nullif(left(trim(coalesce(p_room_name, '')), 40), ''))
      returning * into new_room;
      exit;
    exception when unique_violation then
      if attempt = 10 then raise; end if;
    end;
  end loop;
  select * into result from add_or_rejoin_member(new_room.id, p_name);
  return jsonb_build_object('room', to_jsonb(new_room), 'member', to_jsonb(result.member), 'rejoined', false);
end;
$$;

revoke execute on function public.create_room(text, text, date, text) from public, anon;
grant execute on function public.create_room(text, text, date, text) to authenticated;
