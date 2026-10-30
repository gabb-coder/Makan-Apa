-- Let members (and rooms) be deleted once they have history.
-- A removed member's vetoes and secret picks go with them; meals they decided stay in
-- history with no decider recorded.

alter table vetoes
  drop constraint vetoes_member_id_fkey,
  add constraint vetoes_member_id_fkey foreign key (member_id) references members(id) on delete cascade;

alter table secret_picks
  drop constraint secret_picks_member_id_fkey,
  add constraint secret_picks_member_id_fkey foreign key (member_id) references members(id) on delete cascade;

alter table day_entries
  alter column decider_id drop not null,
  drop constraint day_entries_decider_id_fkey,
  add constraint day_entries_decider_id_fkey foreign key (decider_id) references members(id) on delete set null;
