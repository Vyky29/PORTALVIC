-- Tue 8 Sep: add Ayman 4.30-5 → Javi Palankas (Javier OFF remainder of Ayman hour)
-- Run: npx supabase db query --linked -f database/local-vault/office-tue8-ayman-430-javi-20260908.sql

begin;

create temp table _portal_actor on commit drop as
select 'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid as id;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Cancel any prior active ayman→javi reassign for this slot (idempotent refresh)
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — Ayman 4.30-5 → Javi Palankas refresh',
  spreadsheet_revision = 'office:tue8-ayman-430-javi-20260908',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where session_date = '2026-09-08'
  and override_type = 'instructor_reassign'
  and anchor_staff_id = 'javier'
  and anchor_client_id = 'ayman'
  and anchor_start = '16:30:00'
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
) values (
  '2026-09-08', 'javier', '16:30:00', '17:00:00', 'Acton', 'ayman', '4.30 to 5',
  'instructor_reassign',
  jsonb_build_object(
    'covering_staff_id', 'javi',
    'covering_staff_name', 'Javi Palankas',
    'portal_session_key', '2026-09-08|16:30|ayman',
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity',
    'area', 'Lane (DE)',
    'absent_staff_id', 'javier'
  ),
  'Javi Palankas covers Javier Marquez — ayman 4.30 to 5 2026-09-08',
  'active',
  'office:tue8-ayman-430-javi-20260908',
  (select id from _portal_actor),
  (select id from _portal_actor)
);

-- Refresh dated Acton roster: add Ayman on JAVI 4.30-5 (keep other rows)
delete from public.portal_roster_rows
where session_date = '2026-09-08'
  and venue ilike '%Acton%'
  and status = 'active'
  and instructors ilike 'JAVI%'
  and client_name ilike 'Ayman%';

insert into public.portal_roster_rows (
  client_name, instructors, time_slot, area, day, service, venue, session_date, status,
  created_by, updated_by
)
select
  'Ayman', 'JAVI', '4.30 to 5', 'Lane (DE)', 'Tuesday', 'Aquatic Activity', 'Acton',
  '2026-09-08'::date, 'active', a.id, a.id
from _portal_actor a;

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select override_type, anchor_staff_id, anchor_client_id, anchor_start,
       payload->>'covering_staff_id' as cover, status
from public.schedule_overrides
where session_date = '2026-09-08'
  and status = 'active'
  and anchor_client_id = 'ayman'
order by anchor_start;

select client_name, instructors, time_slot
from public.portal_roster_rows
where session_date = '2026-09-08' and venue ilike '%Acton%' and status = 'active'
  and (client_name ilike 'Ayman%' or instructors ilike 'JAVI%')
order by instructors, time_slot;
