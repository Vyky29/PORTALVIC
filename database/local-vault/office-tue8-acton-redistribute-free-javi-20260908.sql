-- Tue 8 Sep 2026: Aurora OFF — redistribute Acton Aquatic so Javi Palankas is free.
-- Adam → Roberto 4.30–5 · Aydaan → Luliya 5.30–6 · Anas → Javier 6–6.30 ·
-- Junaid → Roberto 5.30–6 (+30')
-- Run: npx supabase db query --linked -f database/local-vault/office-tue8-acton-redistribute-free-javi-20260908.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Cancel Closed + Junaid → Javi covers (Junaid moves time; Closed needs no cover)
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Cancelled — Tue 8 Acton redistribute (Javi free)',
  spreadsheet_revision = 'office:tue8-acton-redistribute-free-javi-20260908',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where session_date = '2026-09-08'
  and override_type = 'instructor_reassign'
  and status = 'active'
  and lower(anchor_staff_id) = 'aurora'
  and lower(anchor_client_id) in ('closed', 'junaid_f');

-- Adam / Aydaan / Anas: same clock, new covering staff
update public.schedule_overrides
set
  payload = jsonb_build_object(
    'covering_staff_id', 'roberto',
    'covering_staff_name', 'Roberto',
    'portal_session_key', '2026-09-08|16:30|adam_mahmmoud',
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity',
    'absent_staff_id', 'aurora'
  ),
  reason = 'Roberto covers Aurora — adam_mahmmoud 16.30 to 17 2026-09-08 (Javi free)',
  spreadsheet_revision = 'office:tue8-acton-redistribute-free-javi-20260908',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where id = '784c8f6f-db8f-471a-b500-d80fe48c3dac';

update public.schedule_overrides
set
  payload = jsonb_build_object(
    'covering_staff_id', 'luliya',
    'covering_staff_name', 'Luliya',
    'portal_session_key', '2026-09-08|17:30|aydaan_ah',
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity',
    'absent_staff_id', 'aurora'
  ),
  reason = 'Luliya covers Aurora — aydaan_ah 17.30 to 18 2026-09-08 (Javi free)',
  spreadsheet_revision = 'office:tue8-acton-redistribute-free-javi-20260908',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where id = '7558ca43-2737-46cd-ae58-41e10a2e98a9';

update public.schedule_overrides
set
  payload = jsonb_build_object(
    'covering_staff_id', 'javier',
    'covering_staff_name', 'Javier',
    'portal_session_key', '2026-09-08|18:00|anas',
    'service', 'Aquatic Activity',
    'activity', 'Aquatic Activity',
    'absent_staff_id', 'aurora'
  ),
  reason = 'Javier covers Aurora — anas 18 to 18.30 2026-09-08 (Javi free)',
  spreadsheet_revision = 'office:tue8-acton-redistribute-free-javi-20260908',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where id = '7f6d9eb8-9954-400b-afc0-987df7c06cbb';

-- Clear Junaid from Aurora 5–5.30
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
  superseded_by,
  spreadsheet_revision,
  created_by,
  updated_by
)
select
  '2026-09-08'::date,
  'aurora',
  '17:00:00'::time,
  '17:30:00'::time,
  'Acton',
  'junaid_f',
  '17 to 17.30',
  'slot_clear_client',
  jsonb_build_object(
    'note', 'Junaid moved +30'' to Roberto 5.30–6 (Aurora OFF redistribute)',
    'client_name', 'Junaid',
    'cancelled_by_admin', true
  ),
  'Junaid Aurora 5–5.30 cleared — moves to Roberto 5.30–6',
  'active',
  null,
  'office:tue8-acton-redistribute-free-javi-20260908',
  a.id,
  a.id
from _portal_actor a
where not exists (
  select 1
  from public.schedule_overrides o
  where o.session_date = '2026-09-08'
    and o.override_type = 'slot_clear_client'
    and lower(o.anchor_client_id) = 'junaid_f'
    and o.status = 'active'
);

-- Place Junaid on Roberto open 5.30–6
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
  superseded_by,
  spreadsheet_revision,
  created_by,
  updated_by
)
select
  '2026-09-08'::date,
  'roberto',
  '17:30:00'::time,
  '18:00:00'::time,
  'Acton',
  'available',
  '17.30 to 18',
  'client_replace_in_slot',
  jsonb_build_object(
    'to_client_id', 'junaid_f',
    'to_client_name', 'Junaid',
    'replacement_client_id', 'junaid_f',
    'replacement_client_name', 'Junaid',
    'portal_session_key', '2026-09-08|17:30|junaid_f',
    'service', 'Aquatic Activity',
    'roster_service', 'Aquatic Activity'
  ),
  'Junaid onto Roberto open 5.30–6 (Aurora OFF redistribute)',
  'active',
  null,
  'office:tue8-acton-redistribute-free-javi-20260908',
  a.id,
  a.id
from _portal_actor a
where not exists (
  select 1
  from public.schedule_overrides o
  where o.session_date = '2026-09-08'
    and o.override_type = 'client_replace_in_slot'
    and lower(o.anchor_staff_id) = 'roberto'
    and o.anchor_start = '17:30:00'
    and o.status = 'active'
);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

-- Dated roster overlays for redistributed clients (canonical scrub owns full books)
delete from public.portal_roster_rows
where session_date = '2026-09-08'
  and venue ilike '%Acton%'
  and status = 'active'
  and service ilike '%aquatic%';

insert into public.portal_roster_rows (
  client_name,
  day,
  instructors,
  service,
  area,
  time_slot,
  venue,
  session_date,
  status,
  created_by,
  updated_by
)
select
  v.client_name,
  'Tuesday',
  v.instructors,
  'Aquatic Activity',
  'Teaching Pool',
  v.time_slot,
  'Acton',
  '2026-09-08'::date,
  'active',
  a.id,
  a.id
from _portal_actor a
cross join (
  values
    ('Adam Mahmmoud', 'ROBERTO', '4.30 to 5'),
    ('Junaid', 'ROBERTO', '5.30 to 6'),
    ('Aydaan Ah', 'LULIYA', '5.30 to 6'),
    ('Anas', 'JAVIER', '6 to 6.30')
) as v(client_name, instructors, time_slot);

commit;
