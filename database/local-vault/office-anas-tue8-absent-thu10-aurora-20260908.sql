-- Anas: cancel Tue 8 with Luliya; makeup Thu 10 Aurora Acton 6-6.30
-- Run: npx supabase db query --linked -f database/local-vault/office-anas-tue8-absent-thu10-aurora-20260908.sql

begin;

create temp table _portal_actor on commit drop as
select 'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid as id;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- 1) Cancel Javi→Luliya cover for Anas today (session cancelled, not covered)
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Cancelled — Anas absent today; makeup Thu 10 Aurora 6-6.30',
  spreadsheet_revision = 'office:anas-tue8-absent-thu10-aurora-20260908',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where session_date = '2026-09-08'
  and override_type = 'instructor_reassign'
  and anchor_client_id = 'anas'
  and status = 'active';

-- 2) Absence today (Luliya book / Acton 6-6.30)
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — Anas Tue 8 absence refresh',
  spreadsheet_revision = 'office:anas-tue8-absent-thu10-aurora-20260908',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where session_date = '2026-09-08'
  and override_type = 'client_absence_announced'
  and anchor_client_id = 'anas'
  and status = 'active';

insert into public.schedule_overrides (
  session_date, anchor_staff_id, anchor_start, anchor_end, anchor_venue,
  anchor_client_id, anchor_time_slot_label, override_type, payload, reason, status,
  spreadsheet_revision, created_by, updated_by
) values (
  '2026-09-08', 'luliya', '18:00:00', '18:30:00', 'Acton', 'anas', '6 to 6.30',
  'client_absence_announced',
  jsonb_build_object(
    'portal_session_key', '2026-09-08|18:00|anas',
    'feedback_resolution', 'absent',
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity'
  ),
  'Anas absent Tue 8 Sep — makeup Thu 10 Aurora 6-6.30',
  'active',
  'office:anas-tue8-absent-thu10-aurora-20260908',
  (select id from _portal_actor),
  (select id from _portal_actor)
);

-- Dated Tue 8: Anas off Luliya → open seat again
delete from public.portal_roster_rows
where session_date = '2026-09-08'
  and venue ilike '%Acton%'
  and status = 'active'
  and client_name ilike 'Anas%';

delete from public.portal_roster_rows
where session_date = '2026-09-08'
  and venue ilike '%Acton%'
  and status = 'active'
  and instructors ilike 'LULIYA%'
  and time_slot in ('6 to 6.30', '6.00 to 6.30')
  and (
    client_name ilike 'No participant%'
    or client_name ilike 'NO PARTICIPANT%'
  );

insert into public.portal_roster_rows (
  client_name, instructors, time_slot, area, day, service, venue, session_date, status,
  created_by, updated_by
)
select
  'No participant', 'LULIYA', '6 to 6.30', 'Lane (DE)', 'Tuesday', 'Aquatic Activity', 'Acton',
  '2026-09-08'::date, 'active', a.id, a.id
from _portal_actor a;

-- 3) Thu 10 makeup: Anas → Aurora 6-6.30 (Joelle Aurora half ends 6 so no overlap)
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — Anas Thu 10 Aurora makeup refresh',
  spreadsheet_revision = 'office:anas-tue8-absent-thu10-aurora-20260908',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where session_date = '2026-09-10'
  and override_type in ('client_replace_in_slot', 'instructor_reassign')
  and (
    anchor_client_id = 'anas'
    or (payload->>'to_client_id') = 'anas'
    or (payload->>'replacement_client_id') = 'anas'
  )
  and status = 'active';

insert into public.schedule_overrides (
  session_date, anchor_staff_id, anchor_start, anchor_end, anchor_venue,
  anchor_client_id, anchor_time_slot_label, override_type, payload, reason, status,
  spreadsheet_revision, created_by, updated_by
) values (
  '2026-09-10', 'aurora', '18:00:00', '18:30:00', 'Acton', 'available', '6 to 6.30',
  'client_replace_in_slot',
  jsonb_build_object(
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity',
    'to_client_id', 'anas',
    'to_client_name', 'Anas',
    'replacement_client_id', 'anas',
    'replacement_client_name', 'Anas',
    'portal_session_key', '2026-09-10|18:00|anas',
    'is_makeup', true,
    'makeup_for_date', '2026-09-08'
  ),
  'Makeup — Anas (absent Tue 8) with Aurora Thu 10 6-6.30 Acton',
  'active',
  'office:anas-tue8-absent-thu10-aurora-20260908',
  (select id from _portal_actor),
  (select id from _portal_actor)
);

-- Dated Thu 10 Acton Aurora: Joelle 5.30-6 + Anas 6-6.30 (Simon keeps Joelle 5.30-6.30)
delete from public.portal_roster_rows
where session_date = '2026-09-10'
  and venue ilike '%Acton%'
  and status = 'active'
  and instructors ilike 'AURORA%'
  and (
    client_name ilike 'Joelle%'
    or client_name ilike 'Anas%'
    or (
      time_slot in ('5.30 to 6.30', '5.30 to 6', '6 to 6.30')
      and (client_name ilike 'No participant%' or client_name ilike 'NO PARTICIPANT%')
    )
  );

insert into public.portal_roster_rows (
  client_name, instructors, time_slot, area, day, service, venue, session_date, status,
  created_by, updated_by
)
select v.client_name, 'AURORA', v.time_slot, 'Lane (DE)', 'Thursday', 'Aquatic Activity', 'Acton',
  '2026-09-10'::date, 'active', a.id, a.id
from _portal_actor a
cross join (
  values
    ('Joelle', '5.30 to 6'),
    ('Anas', '6 to 6.30')
) as v(client_name, time_slot);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select session_date, override_type, anchor_staff_id, anchor_client_id, anchor_start,
       payload->>'covering_staff_id' as cover,
       payload->>'to_client_name' as to_client,
       status
from public.schedule_overrides
where session_date in ('2026-09-08', '2026-09-10')
  and status = 'active'
  and (
    anchor_client_id in ('anas', 'available')
    or (payload->>'to_client_id') = 'anas'
  )
order by session_date, anchor_start;

select session_date, instructors, time_slot, client_name
from public.portal_roster_rows
where session_date in ('2026-09-08', '2026-09-10')
  and venue ilike '%Acton%'
  and status = 'active'
  and (
    client_name ilike 'Anas%'
    or client_name ilike 'Joelle%'
    or (instructors ilike 'LULIYA%' and time_slot ilike '6%')
    or instructors ilike 'AURORA%'
  )
order by session_date, instructors, time_slot;
