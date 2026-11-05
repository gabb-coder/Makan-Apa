-- Swipe to match: the decider deals out a few foods, everyone swipes yes or no on each, and the
-- foods everyone said yes to are the matches. A new deal starts a new round, so old swipes don't
-- count towards it.
alter table public.day_entries
  add column swipe_options text[] check (swipe_options is null or cardinality(swipe_options) between 2 and 12),
  add column swipe_round smallint not null default 0;

create table public.swipes (
  day_entry_id uuid not null references day_entries(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  round smallint not null,
  choice smallint not null check (choice between 0 and 11),
  yes boolean not null,
  created_at timestamptz not null default now(),
  primary key (day_entry_id, member_id, round, choice)
);
create index swipes_member_idx on public.swipes (member_id);
alter table public.swipes enable row level security;
create policy "members read swipes" on public.swipes for select to authenticated
  using (private.is_room_member(private.entry_room_id(day_entry_id)));
create policy "members swipe as themselves" on public.swipes for insert to authenticated
  with check (member_id = private.my_member_id(private.entry_room_id(day_entry_id)));
create policy "members change own swipe" on public.swipes for update to authenticated
  using (member_id = private.my_member_id(private.entry_room_id(day_entry_id)))
  with check (member_id = private.my_member_id(private.entry_room_id(day_entry_id)));
grant select, insert, update on public.swipes to authenticated;
alter publication supabase_realtime add table public.swipes;

-- Tell the room when a new deal starts.
create or replace function private.on_day_entry_change()
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
  if new.vote_options is not null and new.vote_options is distinct from old.vote_options then
    perform private.notify_event('vote', new.room_id, new.id);
  end if;
  if new.swipe_options is not null and new.swipe_round is distinct from old.swipe_round then
    perform private.notify_event('swipe', new.room_id, new.id);
  end if;
  if new.meet_at is not null and (new.meet_at is distinct from old.meet_at or new.meet_place is distinct from old.meet_place) then
    perform private.notify_event('meet', new.room_id, new.id);
  end if;
  return null;
end;
$$;
