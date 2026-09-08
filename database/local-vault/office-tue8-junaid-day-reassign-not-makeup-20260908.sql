-- Restore Junaid → Roberto 5.30–6 as a same-day seat move (not MakeUp / not Absent).
-- Participant attends; staff Today should show Updated by admin only.
-- Run: npx supabase db query --linked -f database/local-vault/office-tue8-junaid-day-reassign-not-makeup-20260908.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Keep Aurora 5–5.30 clear (Junaid left that clock)
update public.schedule_overrides
set
  status = 'active',
  reason = 'Junaid Aurora 5–5.30 cleared — day reassign to Roberto 5.30–6 (not MakeUp)',
  spreadsheet_revision = 'office:tue8-junaid-day-reassign-not-makeup-20260908',
  updated_at = now(),
  updated_by = (select id from _portal_actor),
  payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
    'note', 'Junaid moved +30'' to Roberto 5.30–6 (Aurora OFF redistribute)',
    'client_name', 'Junaid',
    'cancelled_by_admin', true,
    'day_reassign', true,
    'not_makeup', true
  )
where session_date = '2026-09-08'
  and override_type = 'slot_clear_client'
  and lower(anchor_client_id) = 'junaid_f'
  and lower(anchor_staff_id) = 'aurora';

-- Reactivate / upsert Roberto open-slot replace with day_reassign flags
update public.schedule_overrides
set
  status = 'active',
  reason = 'Junaid onto Roberto open 5.30–6 (day reassign, not MakeUp)',
  spreadsheet_revision = 'office:tue8-junaid-day-reassign-not-makeup-20260908',
  updated_at = now(),
  updated_by = (select id from _portal_actor),
  payload = jsonb_build_object(
    'to_client_id', 'junaid_f',
    'to_client_name', 'Junaid',
    'replacement_client_id', 'junaid_f',
    'replacement_client_name', 'Junaid',
    'portal_session_key', '2026-09-08|17:30|junaid_f',
    'service', 'Aquatic Activity',
    'roster_service', 'Aquatic Activity',
    'day_reassign', true,
    'not_makeup', true,
    'replace_kind', 'day_reassign'
  )
where session_date = '2026-09-08'
  and override_type = 'client_replace_in_slot'
  and lower(anchor_staff_id) = 'roberto'
  and anchor_start = '17:30:00'
  and (
    lower(anchor_client_id) in ('available', 'open', 'no_participant')
    or lower(coalesce(payload->>'to_client_id', '')) = 'junaid_f'
    or lower(coalesce(payload->>'replacement_client_id', '')) = 'junaid_f'
  );

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
    'roster_service', 'Aquatic Activity',
    'day_reassign', true,
    'not_makeup', true,
    'replace_kind', 'day_reassign'
  ),
  'Junaid onto Roberto open 5.30–6 (day reassign, not MakeUp)',
  'active',
  null,
  'office:tue8-junaid-day-reassign-not-makeup-20260908',
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

commit;
