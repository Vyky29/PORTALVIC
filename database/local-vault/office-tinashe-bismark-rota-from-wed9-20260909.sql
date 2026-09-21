-- Tinashe Hub Bespoke rota from Wed 9 Sep 2026:
--   Wed: Godsway + John + Bismark (Raul off Tinashe; keeps DC Ikram 3-4 on Wed 9)
--   Fri: Bismark + Roberto + Emanuel
--   Mon (from 14 Sep): Godsway + John + Raul + Bismark (+ Emanuel) via canonical standing
--
--   npx supabase db query --linked -f database/local-vault/office-tinashe-bismark-rota-from-wed9-20260909.sql

begin;

create temp table _portal_actor on commit drop as
select 'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid as id;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- 1) Wed 9: Raul Tinashe → Bismark (Raul stays on DC Ikram 3-4)
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — Tinashe Bismark rota from Wed 9',
  spreadsheet_revision = 'office:tinashe-bismark-rota-from-wed9-20260909',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where session_date in ('2026-09-09'::date, '2026-09-11'::date)
  and status = 'active'
  and spreadsheet_revision = 'office:tinashe-bismark-rota-from-wed9-20260909';

insert into public.schedule_overrides (
  session_date, anchor_staff_id, anchor_start, anchor_end, anchor_venue,
  anchor_client_id, anchor_time_slot_label, override_type, payload, reason, status,
  spreadsheet_revision, created_by, updated_by
)
select
  '2026-09-09'::date, 'raul', '16:15:00'::time, '18:15:00'::time, 'SwimFarm',
  'tinashe', '4.30 to 6', 'instructor_reassign',
  jsonb_build_object(
    'covering_staff_id', 'bismark',
    'covering_staff_name', 'Bismark Gyan',
    'portal_session_key', '2026-09-09|16:30|tinashe',
    'service', 'Bespoke Programme',
    'activity', 'Bespoke Programme',
    'absent_staff_id', 'raul'
  ),
  'Wed 9 — Raul off Tinashe; Bismark joins Godsway + John',
  'active',
  'office:tinashe-bismark-rota-from-wed9-20260909',
  a.id, a.id
from _portal_actor a;

-- 2) Dated Tinashe seats Wed 9 (Overview truth)
delete from public.portal_roster_rows
where session_date = '2026-09-09'
  and status = 'active'
  and lower(coalesce(client_name, '')) like 'tinashe%'
  and lower(coalesce(service, '')) like '%bespoke%';

insert into public.portal_roster_rows (
  client_name, instructors, time_slot, area, day, service, venue, session_date, status,
  created_by, updated_by
)
select v.client_name, v.instructors, v.time_slot, 'Hub Room', 'Wednesday', 'Bespoke Programme', 'SwimFarm',
  '2026-09-09'::date, 'active', a.id, a.id
from _portal_actor a
cross join (
  values
    ('Tinashe', 'GODSWAY', '4.30 to 6'),
    ('Tinashe', 'JOHN', '4.30 to 6'),
    ('Tinashe', 'BISMARK', '4.30 to 6')
) as v(client_name, instructors, time_slot);

-- 3) Dated Tinashe seats Fri 11
delete from public.portal_roster_rows
where session_date = '2026-09-11'
  and status = 'active'
  and lower(coalesce(client_name, '')) like 'tinashe%'
  and lower(coalesce(service, '')) like '%bespoke%';

insert into public.portal_roster_rows (
  client_name, instructors, time_slot, area, day, service, venue, session_date, status,
  created_by, updated_by
)
select v.client_name, v.instructors, v.time_slot, 'Hub Room', 'Friday', 'Bespoke Programme', 'SwimFarm',
  '2026-09-11'::date, 'active', a.id, a.id
from _portal_actor a
cross join (
  values
    ('Tinashe', 'BISMARK', '4.30 to 6'),
    ('Tinashe', 'ROBERTO', '4.30 to 6'),
    ('Tinashe', 'EMANUEL', '4.30 to 6')
) as v(client_name, instructors, time_slot);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
