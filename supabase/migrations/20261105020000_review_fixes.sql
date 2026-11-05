-- Fixes from the November review.

-- 1. Quick votes get rounds, like swipes: calling a vote off and starting another must not
--    carry over anyone's old choice (members can only delete their own vote).
alter table public.day_entries add column vote_round smallint not null default 0;
alter table public.votes add column round smallint not null default 0;
alter table public.votes drop constraint votes_pkey;
alter table public.votes add primary key (day_entry_id, member_id, round);

-- 2. A kitty keeper who leaves stops being the keeper (they'd otherwise stay in charge of the
--    money while the app can't show or change them). leave_room runs as the person leaving, so
--    the host-only guard lets this one change through.
create or replace function private.guard_room_name()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null or current_setting('makan.leaving', true) = 'on' then return new; end if;
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
      or new.rotation_offset is distinct from old.rotation_offset
      or new.auto_decide is distinct from old.auto_decide)
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

create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('makan.leaving', 'on', true);
  update rooms set kitty_keeper = null
  where id = p_room_id
    and kitty_keeper in (select member_id from room_access where room_id = p_room_id and user_id = auth.uid());
  perform set_config('makan.leaving', 'off', true);
  update members set left_at = now()
  where id in (select member_id from room_access where room_id = p_room_id and user_id = auth.uid());
  delete from room_access where room_id = p_room_id and user_id = auth.uid();
end;
$$;

-- 3. Bill alerts also go out when a bill becomes a treat, comes from the kitty, gets a birthday,
--    or who had what changes.
create or replace function private.on_bill_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.amount_cents <> old.amount_cents or new.paid_by <> old.paid_by
     or new.treat is distinct from old.treat or new.from_kitty is distinct from old.from_kitty
     or new.birthday is distinct from old.birthday or new.items::text is distinct from old.items::text then
    perform private.notify_event('bill', new.room_id, new.day_entry_id);
  end if;
  return null;
end;
$$;
