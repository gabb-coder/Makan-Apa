-- Daily "it's your turn" reminders via Web Push.
--
-- Secrets (the cron secret and the VAPID key pair) are generated inside Supabase and kept in
-- a private schema the public API can't reach. Browsers only ever see the VAPID public key.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_config (
  key text primary key,
  value text not null
);

insert into private.app_config (key, value)
values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- One row per browser that wants reminders. Only the functions below and the service role use it.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  remind_hour smallint not null default 11 check (remind_hour between 0 and 23),  -- room's local time
  last_sent_on date,                                                               -- room's local date
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (member_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Browser-facing functions. The endpoint is the browser's own secret URL, so it identifies the row.
create function public.subscribe_push(p_member_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_remind_hour int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into push_subscriptions (room_id, member_id, endpoint, p256dh, auth, remind_hour)
  select m.room_id, m.id, p_endpoint, p_p256dh, p_auth, p_remind_hour from members m where m.id = p_member_id
  on conflict (endpoint) do update
    set room_id = excluded.room_id, member_id = excluded.member_id, p256dh = excluded.p256dh,
        auth = excluded.auth, remind_hour = excluded.remind_hour;
$$;

create function public.unsubscribe_push(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from push_subscriptions where endpoint = p_endpoint;
$$;

create function public.push_status(p_endpoint text)
returns table (member_id uuid, remind_hour smallint)
language sql
stable
security definer
set search_path = public
as $$
  select member_id, remind_hour from push_subscriptions where endpoint = p_endpoint;
$$;

create function public.vapid_public_key()
returns text
language sql
stable
security definer
set search_path = private
as $$
  select (value::jsonb) ->> 'publicKey' from app_config where key = 'vapid';
$$;

-- Service-role-only functions for the send-reminders Edge Function.
create function public.push_config()
returns jsonb
language sql
stable
security definer
set search_path = private
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from app_config;
$$;

-- Stores a VAPID key pair the first time; later calls keep the original pair.
create function public.save_vapid_keys(p_keys text)
returns text
language sql
security definer
set search_path = private
as $$
  insert into app_config (key, value) values ('vapid', p_keys) on conflict (key) do nothing;
  select value from app_config where key = 'vapid';
$$;

revoke execute on function public.push_config() from public, anon, authenticated;
revoke execute on function public.save_vapid_keys(text) from public, anon, authenticated;
grant execute on function public.push_config() to service_role;
grant execute on function public.save_vapid_keys(text) to service_role;

-- Every 15 minutes; the function works out who is due in each room's timezone.
select cron.schedule(
  'send-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://hztewsrnckyddchrcjcz.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from private.app_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
