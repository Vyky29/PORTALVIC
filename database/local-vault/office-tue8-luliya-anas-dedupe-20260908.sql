-- Tue 8: Luliya had open 6-6.30 + Anas cover → drop duplicate open; Anas dated on Luliya
-- Run: npx supabase db query --linked -f database/local-vault/office-tue8-luliya-anas-dedupe-20260908.sql

begin;

create temp table _portal_actor on commit drop as
select 'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid as id;

-- Remove open seat that duplicates Anas cover on Luliya 6-6.30
delete from public.portal_roster_rows
where session_date = '2026-09-08'
  and venue ilike '%Acton%'
  and status = 'active'
  and instructors ilike 'LULIYA%'
  and time_slot in ('6 to 6.30', '6.00 to 6.30', '18 to 18.30')
  and (
    client_name ilike 'No participant%'
    or client_name ilike 'NO PARTICIPANT%'
  );

-- Anas was dated on JAVI; move to Luliya (override already live)
delete from public.portal_roster_rows
where session_date = '2026-09-08'
  and venue ilike '%Acton%'
  and status = 'active'
  and instructors ilike 'JAVI%'
  and client_name ilike 'Anas%';

delete from public.portal_roster_rows
where session_date = '2026-09-08'
  and venue ilike '%Acton%'
  and status = 'active'
  and instructors ilike 'LULIYA%'
  and client_name ilike 'Anas%';

insert into public.portal_roster_rows (
  client_name, instructors, time_slot, area, day, service, venue, session_date, status,
  created_by, updated_by
)
select
  'Anas', 'LULIYA', '6 to 6.30', 'Lane (DE)', 'Tuesday', 'Aquatic Activity', 'Acton',
  '2026-09-08'::date, 'active', a.id, a.id
from _portal_actor a;

commit;

select client_name, instructors, time_slot
from public.portal_roster_rows
where session_date = '2026-09-08' and venue ilike '%Acton%' and status = 'active'
  and (instructors ilike 'LULIYA%' or instructors ilike 'JAVI%' or client_name ilike 'Anas%')
order by instructors, time_slot;
