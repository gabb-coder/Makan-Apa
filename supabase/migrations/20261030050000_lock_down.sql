-- Step B of 2: once the app signs in and uses room_access, remove the old open access.
-- After this, the publishable key alone can't read or change anything; only room members can.

do $$
declare t text;
begin
  foreach t in array array['rooms', 'members', 'food_options', 'day_entries', 'vetoes', 'secret_picks'] loop
    execute format('drop policy if exists "room code is the password" on %I', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- Policy helpers move out of the API schema: policies keep working (they refer to the functions
-- themselves, not their names), but nobody can call them through /rest/v1/rpc.
alter function public.is_room_member(uuid) set schema private;
alter function public.my_member_id(uuid) set schema private;
alter function public.room_host_id(uuid) set schema private;
alter function public.entry_room_id(uuid) set schema private;
grant usage on schema private to authenticated;
-- The schema holds the reminder secrets: keep the table itself closed.
revoke all on private.app_config from public, anon, authenticated;
revoke execute on function private.is_room_member(uuid) from public, anon;
revoke execute on function private.my_member_id(uuid) from public, anon;
revoke execute on function private.room_host_id(uuid) from public, anon;
revoke execute on function private.entry_room_id(uuid) from public, anon;
grant execute on function private.is_room_member(uuid) to authenticated;
grant execute on function private.my_member_id(uuid) to authenticated;
grant execute on function private.room_host_id(uuid) to authenticated;
grant execute on function private.entry_room_id(uuid) to authenticated;

-- Only used inside create_room.
alter function public.room_code() set search_path = '';
revoke execute on function public.room_code() from public, anon, authenticated;

-- Reminder functions: signed-in phones only.
revoke execute on function public.subscribe_push(uuid, text, text, text, int) from public, anon;
revoke execute on function public.unsubscribe_push(text) from public, anon;
revoke execute on function public.push_status(text) from public, anon;
revoke execute on function public.vapid_public_key() from public, anon;
grant execute on function public.subscribe_push(uuid, text, text, text, int) to authenticated;
grant execute on function public.unsubscribe_push(text) to authenticated;
grant execute on function public.push_status(text) to authenticated;
grant execute on function public.vapid_public_key() to authenticated;
