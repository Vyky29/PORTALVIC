-- Demo participant Elia Matilla (Victor Matilla) — re-enrolment 2026/27 test run.
-- 2025/26: Tue 7–8 pm swimming (60') + Sun 3–4:30 pm Multi-Activity at SwimFarm.
-- Privately funded · GoCardless installments.

begin;

-- Stable ids for idempotent re-runs
-- contact_id: elia-matilla-demo
-- parent_person_id: parent-victor-matilla-demo
-- client_key: elia-matilla-2526

insert into public.portal_parent_contacts (
  contact_id,
  parent_person_id,
  child_display,
  child_first_name,
  child_last_name,
  parent_display,
  parent_first_name,
  parent_last_name,
  email,
  mobile,
  dob_iso,
  in_class,
  on_waiting_list
)
values (
  'elia-matilla-demo',
  'parent-victor-matilla-demo',
  'Elia',
  'Elia',
  'Matilla',
  'Victor Matilla',
  'Victor',
  'Matilla',
  'victor.matilla.demo@clubsensational.org',
  '+447700900123',
  '2012-10-20'::date,
  true,
  false
)
on conflict (contact_id) do update set
  parent_person_id = excluded.parent_person_id,
  child_display = excluded.child_display,
  child_first_name = excluded.child_first_name,
  child_last_name = excluded.child_last_name,
  parent_display = excluded.parent_display,
  parent_first_name = excluded.parent_first_name,
  parent_last_name = excluded.parent_last_name,
  email = excluded.email,
  mobile = excluded.mobile,
  dob_iso = excluded.dob_iso,
  in_class = excluded.in_class,
  on_waiting_list = excluded.on_waiting_list,
  updated_at = now();

insert into public.portal_participants (
  contact_id,
  display_name,
  first_name,
  last_name,
  dob_iso,
  parent_person_id,
  in_class,
  on_waiting_list
)
values (
  'elia-matilla-demo',
  'Elia',
  'Elia',
  'Matilla',
  '2012-10-20'::date,
  'parent-victor-matilla-demo',
  true,
  false
)
on conflict (contact_id) do update set
  display_name = excluded.display_name,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  dob_iso = excluded.dob_iso,
  parent_person_id = excluded.parent_person_id,
  in_class = excluded.in_class,
  on_waiting_list = excluded.on_waiting_list,
  updated_at = now();

insert into public.client_payments (
  sheet,
  row_index,
  client_key,
  client_name,
  parent_name,
  payment_status,
  amount,
  data,
  source_file
)
select
  'PARENTS',
  9601,
  'elia-matilla-2526',
  'Elia',
  'Victor Matilla',
  'Paid',
  7760.00,
  json_build_object(
    'Services',
    '60'' SW (Tuesday) · 90'' MULTI ACTIVITY (Sunday)',
    'Programme', 'After-School & Weekends 2025/26',
    'Payment method', 'GoCardless · 10 monthly payments',
    'Fund', 'Privately Funded',
    'VAT', '20% VAT included',
    'Cost', '£100 / session (Tue swim) · £120 / session (Sun multi)',
    'Sessions', '38 weekday (Tue) + 33 weekend (Sun)',
    'Year total', '£7760',
    'Admin fees', '£5 per installment (GoCardless)',
    'Notes', 'Demo seed for re-enrolment 2026/27 test — Elia Matilla / Victor Matilla.'
  )::json,
  'portal_migration_20260704160000'
where not exists (
  select 1 from public.client_payments cp where cp.client_key = 'elia-matilla-2526'
);

update public.client_payments cp
set
  client_name = 'Elia',
  parent_name = 'Victor Matilla',
  amount = 7760.00,
  data = json_build_object(
    'Services',
    '60'' SW (Tuesday) · 90'' MULTI ACTIVITY (Sunday)',
    'Programme', 'After-School & Weekends 2025/26',
    'Payment method', 'GoCardless · 10 monthly payments',
    'Fund', 'Privately Funded',
    'VAT', '20% VAT included',
    'Cost', '£100 / session (Tue swim) · £120 / session (Sun multi)',
    'Sessions', '38 weekday (Tue) + 33 weekend (Sun)',
    'Year total', '£7760',
    'Admin fees', '£5 per installment (GoCardless)',
    'Notes', 'Demo seed for re-enrolment 2026/27 test — Elia Matilla / Victor Matilla.'
  )::json
where cp.client_key = 'elia-matilla-2526';

-- Roster samples for slot enrichment (time, venue, instructor)
delete from public.portal_roster_rows
where lower(trim(client_name)) = 'elia'
  and coalesce(session_date, '2099-01-01'::date) >= '2026-01-01'::date;

insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, v.day, v.time_slot, v.instructors, v.service, v.area, v.venue, v.session_date::date, 'active', au.id, au.id
from auth.users au
cross join (
  values
    ('Elia', 'Tuesday',  '7 to 8',     'ROBERTO', 'Aquatic Activity',  'Teaching Pool', 'Acton',    '2026-06-03'),
    ('Elia', 'Tuesday',  '7 to 8',     'ROBERTO', 'Aquatic Activity',  'Teaching Pool', 'Acton',    '2026-06-10'),
    ('Elia', 'Tuesday',  '7 to 8',     'ROBERTO', 'Aquatic Activity',  'Teaching Pool', 'Acton',    '2026-06-17'),
    ('Elia', 'Sunday',   '3 to 4.30',  'YOUSSEF', 'Multi-Activity',    'Hub Room',      'SwimFarm', '2026-06-07'),
    ('Elia', 'Sunday',   '3 to 4.30',  'YOUSSEF', 'Multi-Activity',    'Hub Room',      'SwimFarm', '2026-06-14'),
    ('Elia', 'Sunday',   '3 to 4.30',  'YOUSSEF', 'Multi-Activity',    'Hub Room',      'SwimFarm', '2026-06-21')
) as v(client_name, day, time_slot, instructors, service, area, venue, session_date)
where au.id = (
  select id from auth.users
  where lower(email) = lower('victor@clubsensational.org')
  limit 1
);

commit;
