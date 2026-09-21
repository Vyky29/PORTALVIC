-- Anas Thu 10 makeup: 2:1 Aurora + Simon Acton 6-6.30 (Joelle last half free).
-- Maiyar stays with Roberto. Joelle ends 6 on both books.
-- Run: npx supabase db query --linked -f database/local-vault/office-anas-thu10-aurora-simon-2to1-20260908.sql

begin;

create temp table _portal_actor on commit drop as
select 'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid as id;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Supersede prior Aurora-only Anas makeup / any Anas Thu 10 replace
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — Anas Thu 10 Aurora+Simon 2:1 makeup refresh',
  spreadsheet_revision = 'office:anas-thu10-aurora-simon-2to1-20260908',
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
) values
(
  '2026-09-10', 'aurora', '18:00:00', '18:30:00', 'Acton', 'available', '6 to 6.30',
  'client_replace_in_slot',
  jsonb_build_object(
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity',
    'to_client_id', 'anas',
    'to_client_name', 'Anas',
    'replacement_client_id', 'anas',
    'replacement_client_name', 'Anas',
    'portal_session_key', '2026-09-10|18:00|anas|aurora',
    'is_makeup', true,
    'makeup_for_date', '2026-09-08',
    'co_staff_id', 'simon',
    'co_staff_name', 'Simon',
    'support_ratio', '2:1'
  ),
  'Makeup — Anas (absent Tue 8) 2:1 Aurora+Simon Thu 10 6-6.30 Acton',
  'active',
  'office:anas-thu10-aurora-simon-2to1-20260908',
  (select id from _portal_actor),
  (select id from _portal_actor)
),
(
  '2026-09-10', 'simon', '18:00:00', '18:30:00', 'Acton', 'available', '6 to 6.30',
  'client_replace_in_slot',
  jsonb_build_object(
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity',
    'to_client_id', 'anas',
    'to_client_name', 'Anas',
    'replacement_client_id', 'anas',
    'replacement_client_name', 'Anas',
    'portal_session_key', '2026-09-10|18:00|anas|simon',
    'is_makeup', true,
    'makeup_for_date', '2026-09-08',
    'co_staff_id', 'aurora',
    'co_staff_name', 'Aurora',
    'support_ratio', '2:1'
  ),
  'Makeup — Anas (absent Tue 8) 2:1 Simon+Aurora Thu 10 6-6.30 Acton',
  'active',
  'office:anas-thu10-aurora-simon-2to1-20260908',
  (select id from _portal_actor),
  (select id from _portal_actor)
);

-- Dated Thu 10: Joelle 5.30-6 + Anas 6-6.30 on Aurora and Simon
delete from public.portal_roster_rows
where session_date = '2026-09-10'
  and venue ilike '%Acton%'
  and status = 'active'
  and (
    instructors ilike 'AURORA%'
    or instructors ilike 'SIMON%'
  )
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
select v.client_name, v.instructors, v.time_slot, 'Lane (DE)', 'Thursday', 'Aquatic Activity', 'Acton',
  '2026-09-10'::date, 'active', a.id, a.id
from _portal_actor a
cross join (
  values
    ('Joelle', 'AURORA', '5.30 to 6'),
    ('Anas', 'AURORA', '6 to 6.30'),
    ('Joelle', 'SIMON', '5.30 to 6'),
    ('Anas', 'SIMON', '6 to 6.30')
) as v(client_name, instructors, time_slot);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select id, override_type, anchor_staff_id, anchor_client_id, anchor_start,
       payload->>'to_client_name' as to_client,
       payload->>'co_staff_name' as co,
       status, reason
from public.schedule_overrides
where session_date = '2026-09-10'
  and status = 'active'
order by anchor_staff_id, anchor_start;

select instructors, time_slot, client_name
from public.portal_roster_rows
where session_date = '2026-09-10'
  and venue ilike '%Acton%'
  and status = 'active'
  and (
    client_name ilike 'Anas%'
    or client_name ilike 'Joelle%'
    or instructors ilike 'AURORA%'
    or instructors ilike 'SIMON%'
  )
order by instructors, time_slot;
