-- Makan apa? initial schema (SPEC.md section 5).

create extension if not exists "pgcrypto";

create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                       -- 6 chars, e.g. 'K7M2QX'
  timezone text not null default 'Asia/Kuala_Lumpur',
  rotation_start date not null default current_date,
  veto_limit int not null default 1,               -- vetoes per non-decider per day
  decision_mode text not null default 'decider'
    check (decision_mode in ('decider','secret')),
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  color text not null default '#CC3F17',           -- avatar colour
  sort_order int not null default 0,               -- defines rotation order
  created_at timestamptz not null default now()
);

create table food_options (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  tags text[] not null default '{}',               -- e.g. {'chinese','cheap','takeaway'}
  icon text not null default 'rice'
    check (icon in ('rice','bowl','pizza','sushi','burger','cup')),
  color text not null default 'leaf',              -- palette key
  added_by uuid references members(id) on delete set null,
  is_active boolean not null default true,         -- archive instead of hard delete
  created_at timestamptz not null default now()
);

create table day_entries (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  entry_date date not null,
  decider_id uuid not null references members(id),
  food_option_id uuid references food_options(id) on delete set null,
  custom_food text,                                -- used when the pick isn't in the pool
  method text check (method in ('direct','wheel')),
  status text not null default 'pending'
    check (status in ('pending','proposed','accepted')),
  created_at timestamptz not null default now(),
  unique (room_id, entry_date)
);

create table vetoes (
  id uuid primary key default gen_random_uuid(),
  day_entry_id uuid not null references day_entries(id) on delete cascade,
  member_id uuid not null references members(id),
  rejected_food text not null,                     -- name kept so stats survive pool edits
  created_at timestamptz not null default now()
);

-- Phase 2 (secret picks)
create table secret_picks (
  id uuid primary key default gen_random_uuid(),
  day_entry_id uuid not null references day_entries(id) on delete cascade,
  member_id uuid not null references members(id),
  food_text text not null,
  created_at timestamptz not null default now(),
  unique (day_entry_id, member_id)
);

create index on members (room_id);
create index on food_options (room_id) where is_active;
create index on day_entries (room_id, entry_date desc);

-- Security: no auth, so the room code acts as the password (SPEC.md section 5).
-- RLS is on everywhere with permissive policies for the anon / publishable key;
-- the client always queries by room_id and never lists rooms.
do $$
declare t text;
begin
  foreach t in array array['rooms','members','food_options','day_entries','vetoes','secret_picks'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "room code is the password" on %I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;

-- Realtime so every phone in a room stays in sync.
alter publication supabase_realtime add table members, food_options, day_entries, vetoes, secret_picks;
