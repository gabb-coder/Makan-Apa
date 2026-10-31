-- Diet and budget preferences, meal ratings, lunch and dinner, bill splitting, the room's own
-- spots, a weekly recap notification and client error reports.

-- 1. Diet and budget ---------------------------------------------------------------------------
-- What each person needs, and what each food is. The app keeps foods that clash with anyone in
-- the room off the wheel: halal and no-pork rule out pork, no-beef rules out beef, vegetarian
-- needs a food marked vegetarian, and a budget rules out pricier foods.
alter table members
  add column diet text[] not null default '{}'
    check (diet <@ array['halal', 'no-pork', 'no-beef', 'vegetarian']),
  add column budget smallint check (budget between 1 and 3);    -- 1 under RM15, 2 under RM50, 3 any

alter table food_options
  add column diet text[] not null default '{}'
    check (diet <@ array['halal', 'pork', 'beef', 'vegetarian']),
  add column price smallint check (price between 1 and 3);      -- same bands as the budget

-- 2. Meal ratings ------------------------------------------------------------------------------
create table public.meal_ratings (
  day_entry_id uuid not null references day_entries(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (day_entry_id, member_id)
);
alter table public.meal_ratings enable row level security;
create policy "members read ratings" on public.meal_ratings for select to authenticated
  using (private.is_room_member(private.entry_room_id(day_entry_id)));
create policy "members rate as themselves" on public.meal_ratings for insert to authenticated
  with check (member_id = private.my_member_id(private.entry_room_id(day_entry_id)));
create policy "members change own rating" on public.meal_ratings for update to authenticated
  using (member_id = private.my_member_id(private.entry_room_id(day_entry_id)))
  with check (member_id = private.my_member_id(private.entry_room_id(day_entry_id)));
create policy "members remove own rating" on public.meal_ratings for delete to authenticated
  using (member_id = private.my_member_id(private.entry_room_id(day_entry_id)));
grant select, insert, update, delete on public.meal_ratings to authenticated;

-- 3. Lunch and dinner --------------------------------------------------------------------------
-- A room decides lunch only (as before) or both; each day then has one entry per meal.
alter table rooms add column meals text not null default 'lunch' check (meals in ('lunch', 'both'));
alter table day_entries add column meal text not null default 'lunch' check (meal in ('lunch', 'dinner'));

do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.day_entries'::regclass and contype = 'u'
    and pg_get_constraintdef(oid) = 'UNIQUE (room_id, entry_date)';
  if c is not null then execute format('alter table public.day_entries drop constraint %I', c); end if;
end $$;
alter table day_entries add constraint day_entries_room_date_meal_key unique (room_id, entry_date, meal);

-- 4. Who paid ----------------------------------------------------------------------------------
create table public.meal_bills (
  day_entry_id uuid primary key references day_entries(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  paid_by uuid not null references members(id) on delete cascade,
  amount_cents int not null check (amount_cents between 1 and 10000000),
  split_between uuid[] not null check (cardinality(split_between) between 1 and 50),
  updated_at timestamptz not null default now()
);
create index on public.meal_bills (room_id);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  from_member uuid not null references members(id) on delete cascade,
  to_member uuid not null references members(id) on delete cascade,
  amount_cents int not null check (amount_cents between 1 and 10000000),
  created_at timestamptz not null default now(),
  check (from_member <> to_member)
);
create index on public.settlements (room_id);

alter table public.meal_bills enable row level security;
alter table public.settlements enable row level security;
create policy "members use bills" on public.meal_bills for all to authenticated
  using (private.is_room_member(room_id))
  with check (private.is_room_member(room_id) and private.entry_room_id(day_entry_id) = room_id);
create policy "members use settlements" on public.settlements for all to authenticated
  using (private.is_room_member(room_id)) with check (private.is_room_member(room_id));
grant select, insert, update, delete on public.meal_bills, public.settlements to authenticated;

-- 5. The room's own spots ----------------------------------------------------------------------
create table public.room_spots (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  area text check (char_length(area) <= 60),
  note text check (char_length(note) <= 200),
  price smallint check (price between 1 and 3),
  diet text check (diet in ('halal', 'pork')),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  added_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.room_spots (room_id);
alter table public.room_spots enable row level security;
create policy "members use room spots" on public.room_spots for all to authenticated
  using (private.is_room_member(room_id)) with check (private.is_room_member(room_id));
grant select, insert, update, delete on public.room_spots to authenticated;

alter publication supabase_realtime add table public.meal_ratings, public.meal_bills, public.settlements, public.room_spots;

-- 6. Weekly recap ------------------------------------------------------------------------------
-- Sent on Sunday evenings to phones with reminders on, unless they turn it off.
alter table public.push_subscriptions
  add column weekly_recap boolean not null default true,
  add column last_recap_on date;

drop function public.push_status(text);
create function public.push_status(p_endpoint text)
returns table (member_id uuid, remind_hour smallint, weekly_recap boolean)
language sql
stable
security definer
set search_path = public
as $$
  select member_id, remind_hour, weekly_recap from push_subscriptions where endpoint = p_endpoint;
$$;

create function public.set_weekly_recap(p_endpoint text, p_on boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update push_subscriptions set weekly_recap = p_on where endpoint = p_endpoint;
$$;

revoke execute on function public.push_status(text) from public, anon;
revoke execute on function public.set_weekly_recap(text, boolean) from public, anon;
grant execute on function public.push_status(text) to authenticated;
grant execute on function public.set_weekly_recap(text, boolean) to authenticated;

-- 7. Client error reports ----------------------------------------------------------------------
-- Write-only for phones (nobody can read them back through the API); at most 20 per hour each.
create table public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  message text not null check (char_length(message) <= 1000),
  stack text check (char_length(stack) <= 4000),
  url text check (char_length(url) <= 500),
  user_agent text check (char_length(user_agent) <= 300),
  app_version text check (char_length(app_version) <= 40)
);
create index on public.client_errors (user_id, created_at);
alter table public.client_errors enable row level security;
create policy "phones report their own errors" on public.client_errors for insert to authenticated
  with check (user_id = (select auth.uid()));
grant insert on public.client_errors to authenticated;

create function private.limit_client_errors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from client_errors where user_id = new.user_id and created_at > now() - interval '1 hour') >= 20 then
    return null; -- quietly drop the rest
  end if;
  return new;
end;
$$;
create trigger limit_client_errors before insert on public.client_errors
  for each row execute function private.limit_client_errors();
