-- Leaving a room takes you out of it for everyone, not just off your phone. You're marked as left
-- rather than deleted, so the bills you paid and the meals you picked stay in its history. Left
-- members are skipped in the rotation, Who's in and new bills; joining again (same name) brings
-- you back.

alter table public.members add column left_at timestamptz;

create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update members set left_at = now()
  where id in (select member_id from room_access where room_id = p_room_id and user_id = auth.uid());
  delete from room_access where room_id = p_room_id and user_id = auth.uid();
end;
$$;

-- Back in the room: no longer left.
create function private.rejoined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update members set left_at = null where id = new.member_id and left_at is not null;
  return new;
end;
$$;
revoke execute on function private.rejoined() from public, anon, authenticated;
create trigger rejoined after insert on public.room_access
  for each row execute function private.rejoined();

-- The host is the longest-standing member who hasn't left.
create or replace function private.room_host_id(p_room_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from members where room_id = p_room_id and left_at is null order by created_at, id limit 1;
$$;
