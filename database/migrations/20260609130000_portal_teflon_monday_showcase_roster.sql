-- Teflon demo: four guide clients on Mon 2026-06-01 (portal guide photo variety).
-- Login Teflon / PIN 1111. Merges over spreadsheet bundle via portal_roster_rows.
begin;

delete from public.portal_roster_rows
 where upper(trim(instructors)) = 'TEFLON'
   and lower(trim(client_name)) in ('mari trini', 'sam', 'vitin', 'jordan', 'alex demo', 'sam demo', 'jordan demo');

insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, v.day, v.time_slot, v.instructors, v.service, v.area, v.venue, v.session_date::date, 'active', au.id, au.id
from auth.users au
cross join (
  values
    ('Mari Trini', 'Monday', '9 to 10',  'TEFLON', 'Aquatic Activity',  'Teaching Pool', 'Acton',    '2026-06-01'),
    ('Vitin',      'Monday', '10 to 11', 'TEFLON', 'Bespoke Programme', 'Client''s Home', 'Chelsea', '2026-06-01'),
    ('Sam',        'Monday', '11 to 12', 'TEFLON', 'Multi-Activity',    'Hub Room',      'SwimFarm', '2026-06-01'),
    ('Jordan',     'Monday', '2 to 3',   'TEFLON', 'Aquatic Activity',  'Teaching Pool', 'Northolt', '2026-06-01'),
    ('Sam',        'Tuesday', '2 to 3',  'TEFLON', 'Multi-Activity',    'Hub Room',      'SwimFarm', '2026-05-27'),
    ('Jordan',     'Sunday',  '10 to 11','TEFLON', 'Aquatic Activity',  'Teaching Pool', 'Northolt', '2026-05-25')
) as v(client_name, day, time_slot, instructors, service, area, venue, session_date)
where lower(au.email) = lower('stf020@staff.import.pending')
on conflict do nothing;

commit;
