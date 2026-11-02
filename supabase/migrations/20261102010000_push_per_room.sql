-- Notifications for every room on a phone. A browser's push endpoint used to belong to one room,
-- so turning notifications on in a second room took them away from the first. Now each phone
-- has one row per room it's in, and can only sign up its own members.

alter table public.push_subscriptions drop constraint push_subscriptions_endpoint_key;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_member_key unique (endpoint, member_id);

drop function public.subscribe_push(uuid, text, text, text, int);
create function public.subscribe_push(p_member_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_remind_hour int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only for a member this account actually is.
  if not exists (select 1 from room_access where member_id = p_member_id and user_id = auth.uid()) then
    raise exception 'Not your member';
  end if;
  insert into push_subscriptions (room_id, member_id, endpoint, p256dh, auth, remind_hour, weekly_recap, notify_events, lang)
  select m.room_id, m.id, p_endpoint, p_p256dh, p_auth, p_remind_hour,
         -- A new room on a phone that already has notifications keeps that phone's choices.
         coalesce((select bool_and(weekly_recap) from push_subscriptions where endpoint = p_endpoint), true),
         coalesce((select bool_and(notify_events) from push_subscriptions where endpoint = p_endpoint), true),
         coalesce((select max(lang) from push_subscriptions where endpoint = p_endpoint), 'en')
  from members m where m.id = p_member_id
  on conflict (endpoint, member_id) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, remind_hour = excluded.remind_hour;
end;
$$;

-- With a member: stop that room's notifications on this phone. Without: stop them all.
drop function public.unsubscribe_push(text);
create function public.unsubscribe_push(p_endpoint text, p_member_id uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  delete from push_subscriptions where endpoint = p_endpoint and (p_member_id is null or member_id = p_member_id);
$$;

revoke execute on function public.subscribe_push(uuid, text, text, text, int) from public, anon;
revoke execute on function public.unsubscribe_push(text, uuid) from public, anon;
grant execute on function public.subscribe_push(uuid, text, text, text, int) to authenticated;
grant execute on function public.unsubscribe_push(text, uuid) to authenticated;
