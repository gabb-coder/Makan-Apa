-- The Bills tab: split a bill by what each person ordered, with SST and service charge, keep a
-- photo of the receipt, and let each person save how kaki can pay them back.

-- 1. Itemised bills ----------------------------------------------------------------------------
-- items is a list of { name, cents, people }: each item's price is shared between its people.
-- Without items a bill is split equally between split_between (bills from before this).
-- amount_cents stays the final total, charges included, so balances read one number.
alter table public.meal_bills
  add column items jsonb
    check (items is null or (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 60)),
  add column service_pct numeric(4, 2) not null default 0 check (service_pct between 0 and 30),
  add column sst_pct numeric(4, 2) not null default 0 check (sst_pct between 0 and 30),
  add column receipt_path text check (char_length(receipt_path) <= 200);

-- 2. How to pay someone back -------------------------------------------------------------------
alter table public.members
  add column pay_duitnow text check (char_length(pay_duitnow) <= 40),
  add column pay_bank text check (char_length(pay_bank) <= 80);

-- Anyone in a room can rename anyone, but only you can change where your money goes.
create function private.own_pay_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.pay_duitnow is distinct from old.pay_duitnow or new.pay_bank is distinct from old.pay_bank)
     and not exists (select 1 from room_access where member_id = new.id and user_id = auth.uid()) then
    raise exception 'Only % can change their payment details.', old.name;
  end if;
  return new;
end;
$$;
revoke execute on function private.own_pay_details() from public, anon, authenticated;
create trigger own_pay_details before update on public.members
  for each row execute function private.own_pay_details();

-- 3. Receipt photos ----------------------------------------------------------------------------
-- Private bucket; files live under <room id>/ and only that room's members can see them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "room members read receipts" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] in
    (select room_id::text from public.room_access where user_id = (select auth.uid())));
create policy "room members add receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] in
    (select room_id::text from public.room_access where user_id = (select auth.uid())));
create policy "room members remove receipts" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] in
    (select room_id::text from public.room_access where user_id = (select auth.uid())));
