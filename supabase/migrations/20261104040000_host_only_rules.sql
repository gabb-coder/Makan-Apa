-- The host sets the room's rules, the decider order and the kitty. Before this, anyone in the
-- room could change them, including making themselves the keeper of everyone's money.
-- Calls with no user (the service role, migrations) are let through, as before.

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
      or new.timezone is distinct from old.timezone)
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

-- The decider order is members.sort_order: only the host moves people up or down.
create function private.guard_member_order()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then return new; end if;
  if new.sort_order is distinct from old.sort_order
     and my_member_id(new.room_id) is distinct from room_host_id(new.room_id) then
    raise exception 'Only the host can change the order' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_member_order() from public, anon, authenticated;
create trigger guard_member_order before update on public.members
  for each row execute function private.guard_member_order();
