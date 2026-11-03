-- Every room decides lunch and dinner (the app shows dinner from 6pm). Rooms can still go back
-- to lunch only in Settings.
alter table public.rooms alter column meals set default 'both';
update public.rooms set meals = 'both' where meals = 'lunch';
