-- Guests (+1s), allergies, treats and birthday bills, polls in chat, and events.

-- 1. Guests: someone bringing friends who aren't on the app ---------------------------------------
alter table public.attendance add column guests smallint not null default 0 check (guests between 0 and 5);

-- 2. Allergies and things people avoid (nuts, seafood, spicy, …), shown on menus -----------------
alter table public.members add column allergies text[] not null default '{}'
  check (cardinality(allergies) <= 8);

-- 3. Treats and birthdays ------------------------------------------------------------------------
-- treat: the payer covers everyone, so nobody owes anything. birthday: that person's share is
-- spread over everyone else.
alter table public.meal_bills
  add column treat boolean not null default false,
  add column birthday uuid references members(id) on delete set null;

-- 4. Polls in the chat ---------------------------------------------------------------------------
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  question text not null check (char_length(trim(question)) between 1 and 120),
  options text[] not null check (cardinality(options) between 2 and 4),
  created_at timestamptz not null default now()
);
alter table public.polls enable row level security;
create policy "members see polls" on public.polls for select to authenticated using (private.is_room_member(room_id));
create policy "members ask as themselves" on public.polls for insert to authenticated
  with check (member_id = private.my_member_id(room_id));
create policy "askers remove polls" on public.polls for delete to authenticated
  using (member_id = private.my_member_id(room_id));
grant select, insert, delete on public.polls to authenticated;

create function private.poll_room_id(p_poll_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select room_id from polls where id = p_poll_id;
$$;
revoke execute on function private.poll_room_id(uuid) from public, anon;
grant execute on function private.poll_room_id(uuid) to authenticated;

create table public.poll_votes (
  poll_id uuid not null references polls(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  choice smallint not null check (choice between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (poll_id, member_id)
);
alter table public.poll_votes enable row level security;
create policy "members see poll votes" on public.poll_votes for select to authenticated
  using (private.is_room_member(private.poll_room_id(poll_id)));
create policy "members vote in polls as themselves" on public.poll_votes for insert to authenticated
  with check (member_id = private.my_member_id(private.poll_room_id(poll_id)));
create policy "members change poll votes" on public.poll_votes for update to authenticated
  using (member_id = private.my_member_id(private.poll_room_id(poll_id)))
  with check (member_id = private.my_member_id(private.poll_room_id(poll_id)));
create policy "members take back poll votes" on public.poll_votes for delete to authenticated
  using (member_id = private.my_member_id(private.poll_room_id(poll_id)));
grant select, insert, update, delete on public.poll_votes to authenticated;

-- A poll shows in the chat as a message pointing at it.
alter table public.messages add column poll_id uuid references polls(id) on delete cascade;

-- 5. Events: a one-off plan with RSVPs, a meet-up and its own bill --------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  created_by uuid references members(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 60),
  starts_at timestamptz not null,
  place text check (char_length(place) <= 80),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index events_room_time on public.events (room_id, starts_at);
alter table public.events enable row level security;
create policy "members see events" on public.events for select to authenticated using (private.is_room_member(room_id));
create policy "members plan events" on public.events for insert to authenticated
  with check (created_by = private.my_member_id(room_id));
create policy "members change events" on public.events for update to authenticated
  using (private.is_room_member(room_id)) with check (private.is_room_member(room_id));
create policy "planner or host cancels events" on public.events for delete to authenticated
  using (created_by = private.my_member_id(room_id) or private.my_member_id(room_id) = private.room_host_id(room_id));
grant select, insert, update, delete on public.events to authenticated;

create function private.event_room_id(p_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select room_id from events where id = p_event_id;
$$;
revoke execute on function private.event_room_id(uuid) from public, anon;
grant execute on function private.event_room_id(uuid) to authenticated;

create table public.event_rsvps (
  event_id uuid not null references events(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  status text not null check (status in ('yes', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
alter table public.event_rsvps enable row level security;
create policy "members see rsvps" on public.event_rsvps for select to authenticated
  using (private.is_room_member(private.event_room_id(event_id)));
create policy "members answer as themselves" on public.event_rsvps for insert to authenticated
  with check (member_id = private.my_member_id(private.event_room_id(event_id)));
create policy "members change their answer" on public.event_rsvps for update to authenticated
  using (member_id = private.my_member_id(private.event_room_id(event_id)))
  with check (member_id = private.my_member_id(private.event_room_id(event_id)));
grant select, insert, update on public.event_rsvps to authenticated;

-- An event's bill: the same shape as a meal's.
create table public.event_bills (
  event_id uuid primary key references events(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  paid_by uuid not null references members(id) on delete cascade,
  amount_cents int not null check (amount_cents between 1 and 10000000),
  split_between uuid[] not null check (cardinality(split_between) between 1 and 50),
  items jsonb check (items is null or (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 60)),
  service_pct numeric(4, 2) not null default 0 check (service_pct between 0 and 30),
  sst_pct numeric(4, 2) not null default 0 check (sst_pct between 0 and 30),
  receipt_path text check (char_length(receipt_path) <= 200),
  from_kitty boolean not null default false,
  treat boolean not null default false,
  birthday uuid references members(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index event_bills_room on public.event_bills (room_id);
alter table public.event_bills enable row level security;
create policy "members use event bills" on public.event_bills for all to authenticated
  using (private.is_room_member(room_id))
  with check (private.is_room_member(room_id) and private.event_room_id(event_id) = room_id);
grant select, insert, update, delete on public.event_bills to authenticated;

-- 6. Alerts: a new event for everyone ------------------------------------------------------------
create function private.on_event_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.notify_event('event', new.room_id, new.id);
  return null;
end;
$$;
revoke execute on function private.on_event_insert() from public, anon, authenticated;
create trigger notify_event_insert after insert on public.events
  for each row execute function private.on_event_insert();

alter publication supabase_realtime add table public.polls, public.poll_votes, public.events, public.event_rsvps, public.event_bills;
