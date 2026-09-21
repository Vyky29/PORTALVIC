-- Thu 10 Sep: Simon leaves at 6 — Anas makeup 6-6.30 is Aurora only (not 2:1).
-- Joelle 5.30-6 stays Aurora+Simon.
--
--   npx supabase db query --linked -f database/local-vault/office-thu10-anas-aurora-only-simon-leaves-6-20260910.sql

begin;

create temp table _portal_actor on commit drop as
select 'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid as id;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Cancel Simon Anas makeup + refresh Aurora Anas (no co_staff)
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — Simon leaves at 6 Thu; Anas makeup Aurora only',
  spreadsheet_revision = 'office:thu10-anas-aurora-only-simon-leaves-6-20260910',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where session_date = '2026-09-10'
  and status = 'active'
  and override_type = 'client_replace_in_slot'
  and anchor_client_id = 'available'
  and (
    anchor_staff_id = 'simon'
    or (
      anchor_staff_id = 'aurora'
      and coalesce(payload->>'to_client_id', payload->>'replacement_client_id', '') in ('anas')
    )
  );

insert into public.schedule_overrides (
  session_date, anchor_staff_id, anchor_start, anchor_end, anchor_venue,
  anchor_client_id, anchor_time_slot_label, override_type, payload, reason, status,
  spreadsheet_revision, created_by, updated_by
)
select
  '2026-09-10'::date, 'aurora', '18:00:00'::time, '18:30:00'::time, 'Acton',
  'available', '6 to 6.30', 'client_replace_in_slot',
  jsonb_build_object(
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity',
    'is_makeup', true,
    'to_client_id', 'anas',
    'to_client_name', 'Anas',
    'makeup_for_date', '2026-09-08',
    'portal_session_key', '2026-09-10|18:00|anas',
    'replacement_client_id', 'anas',
    'replacement_client_name', 'Anas'
  ),
  'Makeup — Anas (absent Tue 8) Aurora only Thu 10 6-6.30 (Simon leaves at 6)',
  'active',
  'office:thu10-anas-aurora-only-simon-leaves-6-20260910',
  a.id, a.id
from _portal_actor a;

-- Dated roster: drop Simon Anas; keep Joelle halves + Aurora Anas
delete from public.portal_roster_rows
where session_date = '2026-09-10'
  and status = 'active'
  and venue ilike '%Acton%'
  and lower(coalesce(service, '')) like '%aquatic%'
  and (
    (lower(client_name) like 'anas%' and instructors ilike '%SIMON%')
    or (lower(client_name) like 'joelle%' and instructors ~* '(AURORA|SIMON)')
    or (lower(client_name) like 'anas%' and instructors ilike '%AURORA%')
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
    ('Joelle', 'SIMON', '5.30 to 6'),
    ('Anas', 'AURORA', '6 to 6.30')
) as v(client_name, instructors, time_slot);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
