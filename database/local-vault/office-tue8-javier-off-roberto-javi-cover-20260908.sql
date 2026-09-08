-- Tue 8 Sep: Javier Marquez OFF covers
-- Ayman 4-4.30 → Roberto; Linda / Rayan Ta / Anas → Javi Palankas
-- Run: npx supabase db query --linked -f database/local-vault/office-tue8-javier-off-roberto-javi-cover-20260908.sql

begin;

create temp table _portal_actor on commit drop as
select 'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid as id;

-- Service-role / linked SQL has no auth.uid(); trigger would null updated_by
alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Cancel Aurora→Anas→Javier (Anas moves via Javier OFF → Javi)
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Cancelled — Anas now covered from Javier OFF → Javi Palankas',
  spreadsheet_revision = 'office:tue8-javier-off-roberto-javi-cover-20260908',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where session_date = '2026-09-08'
  and override_type = 'instructor_reassign'
  and anchor_staff_id = 'aurora'
  and anchor_client_id = 'anas'
  and status = 'active';

-- Cancel any COVER NEEDED still on Javier for today
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Cancelled — real cover assigned (Roberto / Javi Palankas)',
  spreadsheet_revision = 'office:tue8-javier-off-roberto-javi-cover-20260908',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where session_date = '2026-09-08'
  and override_type = 'instructor_cover_needed'
  and anchor_staff_id = 'javier'
  and status = 'active';

update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — Javier OFF cover refresh',
  spreadsheet_revision = 'office:tue8-javier-off-roberto-javi-cover-20260908',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where session_date = '2026-09-08'
  and override_type = 'instructor_reassign'
  and anchor_staff_id = 'javier'
  and anchor_client_id in ('ayman', 'linda', 'rayan_ta', 'anas')
  and status = 'active';

insert into public.schedule_overrides (
  session_date,
  anchor_staff_id,
  anchor_start,
  anchor_end,
  anchor_venue,
  anchor_client_id,
  anchor_time_slot_label,
  override_type,
  payload,
  reason,
  status,
  spreadsheet_revision,
  created_by,
  updated_by
) values
(
  '2026-09-08', 'javier', '16:00:00', '16:30:00', 'Acton', 'ayman', '4 to 4.30',
  'instructor_reassign',
  jsonb_build_object(
    'covering_staff_id', 'roberto',
    'covering_staff_name', 'Roberto',
    'portal_session_key', '2026-09-08|16:00|ayman',
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity',
    'area', 'Lane (DE)',
    'absent_staff_id', 'javier'
  ),
  'Roberto covers Javier Marquez — ayman 4 to 4.30 2026-09-08',
  'active',
  'office:tue8-javier-off-roberto-javi-cover-20260908',
  (select id from _portal_actor),
  (select id from _portal_actor)
),
(
  '2026-09-08', 'javier', '17:00:00', '17:30:00', 'Acton', 'linda', '5 to 5.30',
  'instructor_reassign',
  jsonb_build_object(
    'covering_staff_id', 'javi',
    'covering_staff_name', 'Javi Palankas',
    'portal_session_key', '2026-09-08|17:00|linda',
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity',
    'area', 'Lane (SE)',
    'absent_staff_id', 'javier'
  ),
  'Javi Palankas covers Javier Marquez — linda 5 to 5.30 2026-09-08',
  'active',
  'office:tue8-javier-off-roberto-javi-cover-20260908',
  (select id from _portal_actor),
  (select id from _portal_actor)
),
(
  '2026-09-08', 'javier', '17:30:00', '18:00:00', 'Acton', 'rayan_ta', '5.30 to 6',
  'instructor_reassign',
  jsonb_build_object(
    'covering_staff_id', 'javi',
    'covering_staff_name', 'Javi Palankas',
    'portal_session_key', '2026-09-08|17:30|rayan_ta',
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity',
    'area', 'Lane (DE)',
    'absent_staff_id', 'javier'
  ),
  'Javi Palankas covers Javier Marquez — rayan_ta 5.30 to 6 2026-09-08',
  'active',
  'office:tue8-javier-off-roberto-javi-cover-20260908',
  (select id from _portal_actor),
  (select id from _portal_actor)
),
(
  '2026-09-08', 'javier', '18:00:00', '18:30:00', 'Acton', 'anas', '6 to 6.30',
  'instructor_reassign',
  jsonb_build_object(
    'covering_staff_id', 'javi',
    'covering_staff_name', 'Javi Palankas',
    'portal_session_key', '2026-09-08|18:00|anas',
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity',
    'area', 'Lane (DE)',
    'absent_staff_id', 'javier'
  ),
  'Javi Palankas covers Javier Marquez — anas 6 to 6.30 2026-09-08',
  'active',
  'office:tue8-javier-off-roberto-javi-cover-20260908',
  (select id from _portal_actor),
  (select id from _portal_actor)
);

delete from public.portal_roster_rows
where session_date = '2026-09-08'
  and venue ilike '%Acton%';

insert into public.portal_roster_rows (
  client_name, instructors, time_slot, area, day, service, venue, session_date, status,
  created_by, updated_by
)
select
  v.client_name, v.instructors, v.time_slot, v.area, 'Tuesday', 'Aquatic Activity', 'Acton',
  '2026-09-08'::date, 'active', a.id, a.id
from _portal_actor a
cross join (
  values
    ('Ayman', 'ROBERTO', '4 to 4.30', 'Lane (DE)'),
    ('Adam Mahmmoud', 'ROBERTO', '4.30 to 5', 'Teaching Pool'),
    ('Logan', 'ROBERTO', '5 to 5.30', 'Lane (DE)'),
    ('Junaid', 'ROBERTO', '5.30 to 6', 'Lane (SE)'),
    ('Richard', 'ROBERTO', '6 to 6.30', 'Lane (DE)'),
    ('No participant', 'LULIYA', '4 to 4.30', 'Lane (DE)'),
    ('Serine', 'LULIYA', '4.30 to 5.30', 'Lane (DE)'),
    ('Aydaan Ah', 'LULIYA', '5.30 to 6', 'Lane (SE)'),
    ('No participant', 'LULIYA', '6 to 6.30', 'Lane (DE)'),
    ('Linda', 'JAVI', '5 to 5.30', 'Lane (SE)'),
    ('Rayan Ta', 'JAVI', '5.30 to 6', 'Lane (DE)'),
    ('Anas', 'JAVI', '6 to 6.30', 'Lane (DE)')
) as v(client_name, instructors, time_slot, area);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select override_type, anchor_staff_id, anchor_client_id, anchor_start,
       payload->>'covering_staff_id' as cover, status
from public.schedule_overrides
where session_date = '2026-09-08' and status = 'active'
order by anchor_start;

select client_name, instructors, time_slot, area
from public.portal_roster_rows
where session_date = '2026-09-08' and venue ilike '%Acton%' and status = 'active'
order by instructors, time_slot;
