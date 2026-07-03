-- Remaining sundayDateOverrides → portal_roster_rows (2026-06-07 … 2026-07-12).
-- Giuseppe→Lulia (14/06); JOHN/BERTA lead hub pair (07, 14, 28/06, 05, 12/07).
-- Bundle keeps leadOnDuty only; instructor covers live in portal_roster_rows.

begin;

insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, v.day, v.time_slot, v.instructors, v.service, v.area, v.venue, v.session_date::date, 'active', au.id, au.id
from auth.users au
cross join (
  values
    ('Rayyan Fi', 'Sunday', '1.15 to 2', 'LULIA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Samer', 'Sunday', '10.15 to 11', 'LULIA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Eiji', 'Sunday', '11 to 11.45', 'LULIA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Hazem', 'Sunday', '11.45 to 12.30', 'LULIA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Haneef', 'Sunday', '12.30 to 1.15', 'LULIA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Zaid', 'Sunday', '9.30 to 10.15', 'LULIA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Aydaan Ah', 'Sunday', '1.15 to 2', 'JOHN', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-07'),
    ('Adam Ab', 'Sunday', '10.15 to 11', 'JOHN', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-07'),
    ('Cyrus', 'Sunday', '11 to 11.45', 'JOHN', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-07'),
    ('Aydaan Ah', 'Sunday', '1.15 to 2', 'JOHN', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-28'),
    ('Adam Ab', 'Sunday', '10.15 to 11', 'JOHN', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-28'),
    ('Cyrus', 'Sunday', '11 to 11.45', 'JOHN', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-28'),
    ('Aydaan Ah', 'Sunday', '1.15 to 2', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-05'),
    ('Adam Ab', 'Sunday', '10.15 to 11', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-05'),
    ('Cyrus', 'Sunday', '11 to 11.45', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-05'),
    ('Aydaan Ah', 'Sunday', '1.15 to 2', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Adam Ab', 'Sunday', '10.15 to 11', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Cyrus', 'Sunday', '11 to 11.45', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Aydaan Ah', 'Sunday', '1.15 to 2', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-12'),
    ('Adam Ab', 'Sunday', '10.15 to 11', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-12'),
    ('Cyrus', 'Sunday', '11 to 11.45', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-12')
) as v(client_name, day, time_slot, instructors, service, area, venue, session_date)
where lower(au.email) = lower('stf020@staff.import.pending')
on conflict do nothing;

update public.portal_roster_rows r
set instructors = v.instructors, service = v.service, area = v.area, venue = v.venue, day = v.day, updated_at = now()
from (
  values
    ('Rayyan Fi', 'Sunday', '1.15 to 2', 'LULIA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Samer', 'Sunday', '10.15 to 11', 'LULIA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Eiji', 'Sunday', '11 to 11.45', 'LULIA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Hazem', 'Sunday', '11.45 to 12.30', 'LULIA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Haneef', 'Sunday', '12.30 to 1.15', 'LULIA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Zaid', 'Sunday', '9.30 to 10.15', 'LULIA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Aydaan Ah', 'Sunday', '1.15 to 2', 'JOHN', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-07'),
    ('Adam Ab', 'Sunday', '10.15 to 11', 'JOHN', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-07'),
    ('Cyrus', 'Sunday', '11 to 11.45', 'JOHN', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-07'),
    ('Aydaan Ah', 'Sunday', '1.15 to 2', 'JOHN', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-28'),
    ('Adam Ab', 'Sunday', '10.15 to 11', 'JOHN', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-28'),
    ('Cyrus', 'Sunday', '11 to 11.45', 'JOHN', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-28'),
    ('Aydaan Ah', 'Sunday', '1.15 to 2', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-05'),
    ('Adam Ab', 'Sunday', '10.15 to 11', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-05'),
    ('Cyrus', 'Sunday', '11 to 11.45', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-05'),
    ('Aydaan Ah', 'Sunday', '1.15 to 2', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Adam Ab', 'Sunday', '10.15 to 11', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Cyrus', 'Sunday', '11 to 11.45', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-06-14'),
    ('Aydaan Ah', 'Sunday', '1.15 to 2', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-12'),
    ('Adam Ab', 'Sunday', '10.15 to 11', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-12'),
    ('Cyrus', 'Sunday', '11 to 11.45', 'BERTA', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-12')
) as v(client_name, day, time_slot, instructors, service, area, venue, session_date)
where r.status = 'active'
  and r.session_date = v.session_date::date
  and lower(trim(r.client_name)) = lower(trim(v.client_name))
  and lower(trim(r.time_slot)) = lower(trim(v.time_slot));

commit;
