-- Sunday 2026-06-21 Westway climbing covers (was sundayDateOverrides in bundle):
--   ALEX  → BISMARK (Alex off)
--   CARLOS → JAVI    (Carlos off; Javi Palankas covers climbing block)
-- Merged over spreadsheet bundle via portal_roster_rows (canonical roster overlay).

begin;

delete from public.portal_roster_rows
where status = 'active'
  and session_date = '2026-06-21'::date
  and lower(trim(venue)) = 'westway'
  and lower(trim(service)) like '%climb%'
  and lower(trim(instructors)) in ('alex', 'carlos', 'bismark', 'javi');

insert into public.portal_roster_rows (
  client_name,
  day,
  time_slot,
  instructors,
  service,
  area,
  venue,
  session_date,
  status,
  created_by,
  updated_by
)
select
  v.client_name,
  v.day,
  v.time_slot,
  v.instructors,
  v.service,
  v.area,
  v.venue,
  v.session_date::date,
  'active',
  au.id,
  au.id
from auth.users au
cross join (
  values
    ('Rodin',    'Sunday', '1 to 2',    'BISMARK', 'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Zakariya', 'Sunday', '1 to 2',    'JAVI',    'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Eiji',     'Sunday', '10 to 11',  'BISMARK', 'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Hazem',    'Sunday', '10 to 11',  'JAVI',    'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Yusuf Ah', 'Sunday', '11 to 12',  'BISMARK', 'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Zaid',     'Sunday', '11 to 12',  'JAVI',    'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Scott',    'Sunday', '12 to 1',   'BISMARK', 'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Serine',   'Sunday', '12 to 1',   'JAVI',    'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Ayden W',  'Sunday', '2 to 3',    'BISMARK', 'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Patrick',  'Sunday', '2 to 3',    'JAVI',    'Climbing Activity', 'Wall', 'Westway', '2026-06-21')
) as v(client_name, day, time_slot, instructors, service, area, venue, session_date)
where lower(au.email) = lower('stf020@staff.import.pending')
on conflict do nothing;

update public.portal_roster_rows r
set
  instructors = v.instructors,
  service = v.service,
  area = v.area,
  venue = v.venue,
  day = v.day,
  updated_at = now()
from (
  values
    ('Rodin',    'Sunday', '1 to 2',    'BISMARK', 'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Zakariya', 'Sunday', '1 to 2',    'JAVI',    'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Eiji',     'Sunday', '10 to 11',  'BISMARK', 'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Hazem',    'Sunday', '10 to 11',  'JAVI',    'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Yusuf Ah', 'Sunday', '11 to 12',  'BISMARK', 'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Zaid',     'Sunday', '11 to 12',  'JAVI',    'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Scott',    'Sunday', '12 to 1',   'BISMARK', 'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Serine',   'Sunday', '12 to 1',   'JAVI',    'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Ayden W',  'Sunday', '2 to 3',    'BISMARK', 'Climbing Activity', 'Wall', 'Westway', '2026-06-21'),
    ('Patrick',  'Sunday', '2 to 3',    'JAVI',    'Climbing Activity', 'Wall', 'Westway', '2026-06-21')
) as v(client_name, day, time_slot, instructors, service, area, venue, session_date)
where r.status = 'active'
  and r.session_date = v.session_date::date
  and lower(trim(r.client_name)) = lower(trim(v.client_name))
  and lower(trim(r.time_slot)) = lower(trim(v.time_slot));

commit;
