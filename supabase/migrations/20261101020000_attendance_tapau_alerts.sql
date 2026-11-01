-- Who's in today, tapau runs, and notifications when things happen.

-- 1. Who's in -----------------------------------------------------------------------------------
-- One row per person per meal once they say. No row means in. Out people are skipped as
-- decider, don't filter the wheel with their diet, and are left off new bills.
create table public.attendance (
  room_id uuid not null references rooms(id) on delete cascade,
  entry_date date not null,
  meal text not null default 'lunch' check (meal in ('lunch', 'dinner')),
  member_id uuid not null references members(id) on delete cascade,
  status text not null check (status in ('in', 'late', 'out')),
  updated_at timestamptz not null default now(),
  primary key (room_id, entry_date, meal, member_id)
);
alter table public.attendance enable row level security;
create policy "members use attendance" on public.attendance for all to authenticated
  using (private.is_room_member(room_id))
  with check (private.is_room_member(room_id) and exists (select 1 from members m where m.id = member_id and m.room_id = attendance.room_id));
grant select, insert, update, delete on public.attendance to authenticated;

-- 2. Tapau runs ---------------------------------------------------------------------------------
-- Someone's going to buy the meal; everyone adds what they want; it becomes the bill.
create table public.tapau_runs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  day_entry_id uuid not null unique references day_entries(id) on delete cascade,
  runner_id uuid not null references members(id) on delete cascade,
  place text not null check (char_length(trim(place)) between 1 and 60),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index on public.tapau_runs (room_id);

create table public.tapau_orders (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references tapau_runs(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  item text not null check (char_length(trim(item)) between 1 and 60),
  qty smallint not null default 1 check (qty between 1 and 20),
  price_cents int check (price_cents between 1 and 1000000),
  note text check (char_length(note) <= 80),
  created_at timestamptz not null default now()
);
create index on public.tapau_orders (run_id);

create function private.run_room_id(p_run_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select room_id from tapau_runs where id = p_run_id;
$$;
revoke execute on function private.run_room_id(uuid) from public, anon;
grant execute on function private.run_room_id(uuid) to authenticated;

alter table public.tapau_runs enable row level security;
alter table public.tapau_orders enable row level security;
create policy "members use runs" on public.tapau_runs for all to authenticated
  using (private.is_room_member(room_id))
  with check (private.is_room_member(room_id) and private.entry_room_id(day_entry_id) = room_id);
-- Orders can be added for anyone in the room (the runner taking a WhatsApp order), but only
-- while the run is open.
create policy "members read orders" on public.tapau_orders for select to authenticated
  using (private.is_room_member(private.run_room_id(run_id)));
create policy "members add orders" on public.tapau_orders for insert to authenticated
  with check (
    private.is_room_member(private.run_room_id(run_id))
    and exists (select 1 from tapau_runs r join members m on m.room_id = r.room_id where r.id = run_id and m.id = member_id and r.status = 'open')
  );
create policy "members change orders" on public.tapau_orders for update to authenticated
  using (private.is_room_member(private.run_room_id(run_id)))
  with check (private.is_room_member(private.run_room_id(run_id)));
create policy "members remove orders" on public.tapau_orders for delete to authenticated
  using (private.is_room_member(private.run_room_id(run_id)));
grant select, insert, update, delete on public.tapau_runs, public.tapau_orders to authenticated;

alter publication supabase_realtime add table public.attendance, public.tapau_runs, public.tapau_orders;

-- 3. Notifications when things happen ----------------------------------------------------------
-- Phones with reminders on also get alerts (unless they turn them off), in their language.
alter table public.push_subscriptions
  add column notify_events boolean not null default true,
  add column lang text not null default 'en' check (lang in ('en', 'ms', 'zh')),
  add column last_nudge_on date;

drop function public.push_status(text);
create function public.push_status(p_endpoint text)
returns table (member_id uuid, remind_hour smallint, weekly_recap boolean, notify_events boolean)
language sql
stable
security definer
set search_path = public
as $$
  select member_id, remind_hour, weekly_recap, notify_events from push_subscriptions where endpoint = p_endpoint;
$$;

create function public.set_push_prefs(p_endpoint text, p_events boolean, p_lang text)
returns void
language sql
security definer
set search_path = public
as $$
  update push_subscriptions
    set notify_events = coalesce(p_events, notify_events),
        lang = case when p_lang in ('en', 'ms', 'zh') then p_lang else lang end
  where endpoint = p_endpoint;
$$;

revoke execute on function public.push_status(text) from public, anon;
revoke execute on function public.set_push_prefs(text, boolean, text) from public, anon;
grant execute on function public.push_status(text) to authenticated;
grant execute on function public.set_push_prefs(text, boolean, text) to authenticated;

-- Hands an event to the notify Edge Function. pg_net sends it after the transaction commits, so
-- a slow or failed push never holds up or undoes the change itself.
create function private.notify_event(p_type text, p_room_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from push_subscriptions where room_id = p_room_id and notify_events) then
    return;
  end if;
  perform net.http_post(
    url := 'https://hztewsrnckyddchrcjcz.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from private.app_config where key = 'cron_secret')
    ),
    body := jsonb_build_object('type', p_type, 'room_id', p_room_id, 'id', p_id, 'actor', private.my_member_id(p_room_id)),
    timeout_milliseconds := 15000
  );
end;
$$;
revoke execute on function private.notify_event(text, uuid, uuid) from public, anon, authenticated;

create function private.on_day_entry_change()
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
  return null;
end;
$$;
create trigger notify_day_entry after update on public.day_entries
  for each row execute function private.on_day_entry_change();

create function private.on_bill_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.amount_cents <> old.amount_cents or new.paid_by <> old.paid_by then
    perform private.notify_event('bill', new.room_id, new.day_entry_id);
  end if;
  return null;
end;
$$;
create trigger notify_bill after insert or update on public.meal_bills
  for each row execute function private.on_bill_change();

create function private.on_run_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.notify_event('tapau', new.room_id, new.id);
  return null;
end;
$$;
create trigger notify_run after insert on public.tapau_runs
  for each row execute function private.on_run_insert();

create function private.on_order_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.notify_event('order', private.run_room_id(new.run_id), new.id);
  return null;
end;
$$;
create trigger notify_order after insert on public.tapau_orders
  for each row execute function private.on_order_insert();

revoke execute on function private.on_day_entry_change(), private.on_bill_change(), private.on_run_insert(), private.on_order_insert()
  from public, anon, authenticated;
