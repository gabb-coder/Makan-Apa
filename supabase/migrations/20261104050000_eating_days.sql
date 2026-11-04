-- Days a room eats together. Turns go one eating day at a time, so weekends and Selangor's
-- public holidays (the list is in src/lib/calendar.ts) don't use anyone's turn. New rooms eat
-- together Monday to Friday and skip holidays; the host can change both in Settings.
alter table public.rooms
  add column eat_days smallint[] not null default '{1,2,3,4,5}'
    check (cardinality(eat_days) between 1 and 7 and eat_days <@ '{0,1,2,3,4,5,6}'::smallint[]),
  add column skip_holidays boolean not null default true,
  -- Added to the turn count, so changing the eating days doesn't move whose turn it is.
  add column rotation_offset int not null default 0;

-- Rooms made before this took a turn every day. Move them to weekdays without holidays, keeping
-- whoever is next up on their next eating day: offset = days − eating days from the start to it.
with holidays(d) as (select unnest('{2026-01-01,2026-02-01,2026-02-02,2026-02-17,2026-02-18,2026-03-07,2026-03-20,2026-03-21,2026-03-22,2026-03-23,2026-05-01,2026-05-27,2026-05-31,2026-06-01,2026-06-17,2026-08-25,2026-08-31,2026-09-01,2026-09-16,2026-10-26,2026-11-08,2026-11-09,2026-12-11,2026-12-25,2027-01-01,2027-01-22,2027-02-06,2027-02-07,2027-02-08,2027-02-24,2027-03-10,2027-03-11,2027-05-01,2027-05-17,2027-05-20,2027-06-06,2027-06-07,2027-06-08,2027-08-15,2027-08-16,2027-08-31,2027-09-16,2027-10-28,2027-12-11,2027-12-25}'::date[])),
     rooms_now as (
       select r.id, r.rotation_start as start,
              (select min(d)::date from generate_series((now() at time zone r.timezone)::date, (now() at time zone r.timezone)::date + 14, interval '1 day') d
                where extract(isodow from d) < 6 and d::date not in (select d from holidays)) as ref
       from public.rooms r
     )
update public.rooms r
set eat_days = '{1,2,3,4,5}',
    skip_holidays = true,
    rotation_offset = (n.ref - n.start) - sign(n.ref - n.start)::int * (
      select count(*)::int from generate_series(least(n.start, n.ref), greatest(n.start, n.ref) - 1, interval '1 day') d
      where extract(isodow from d) < 6 and d::date not in (select d from holidays)
    )
from rooms_now n
where n.id = r.id;

-- Only the host changes the eating days, like the other rules.
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
      or new.timezone is distinct from old.timezone
      or new.eat_days is distinct from old.eat_days
      or new.skip_holidays is distinct from old.skip_holidays
      or new.rotation_offset is distinct from old.rotation_offset)
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
