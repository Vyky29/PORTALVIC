-- Capacity chain owns standing Overview seats.
-- Void redundant autumn overrides + note John covers (insert via TS --apply).
--
--   npx supabase db query --linked -f database/local-vault/office-void-capacity-chain-redundant-overrides-20260914.sql
-- Prefer TS --apply for voids + John→Emmanuel inserts together.

begin;

create temp table _portal_actor on commit drop as
select 'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid as id;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- 1) Patrick term slot_update (Alex paper; standing = Carlos + capacity occupants)
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — capacity chain standing / John cover (office:void-capacity-chain-redundant-overrides-20260914)',
  spreadsheet_revision = 'office:void-capacity-chain-redundant-overrides-20260914',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where status = 'active'
  and override_type = 'slot_update'
  and lower(coalesce(anchor_client_id, '')) = 'patrick'
  and session_date >= '2026-09-01'::date
  and session_date <= '2026-12-20'::date
  and reason ilike 'Term roster%';

-- 2) Giuseppe duplicate of Emanuel-anchored Youssef Sun 6 hub cover
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — capacity chain standing / John cover (office:void-capacity-chain-redundant-overrides-20260914)',
  spreadsheet_revision = 'office:void-capacity-chain-redundant-overrides-20260914',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where status = 'active'
  and override_type = 'instructor_reassign'
  and lower(coalesce(anchor_staff_id, '')) = 'giuseppe'
  and session_date = '2026-09-06'::date
  and reason ilike 'Youssef covers Emanuel%';

-- 3) Wed 9/16 Tinashe session_add shadowing (replaced by John→Emmanuel reassign via TS)
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — capacity chain standing / John cover (office:void-capacity-chain-redundant-overrides-20260914)',
  spreadsheet_revision = 'office:void-capacity-chain-redundant-overrides-20260914',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where status = 'active'
  and override_type = 'session_add'
  and lower(coalesce(anchor_client_id, '')) = 'tinashe'
  and session_date in ('2026-09-09'::date, '2026-09-16'::date)
  and reason ilike '%shadowing%';

-- 4) John→Emmanuel Tinashe covers (Wed 9 + Wed 16) if missing
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
)
select
  v.session_date::date,
  'john',
  '16:30:00'::time,
  '18:00:00'::time,
  'SwimFarm',
  'tinashe',
  '4.30 to 6',
  'instructor_reassign',
  jsonb_build_object(
    'service', 'Bespoke Programme',
    'activity', 'Bespoke Programme',
    'area', 'Hub Room',
    'absent_staff_id', 'john',
    'absent_staff_name', 'John',
    'covering_staff_id', 'emmanuel',
    'covering_staff_name', 'Emmanuel',
    'portal_session_key', v.portal_session_key
  ),
  v.reason,
  'active',
  'office:void-capacity-chain-redundant-overrides-20260914',
  (select id from _portal_actor),
  (select id from _portal_actor)
from (
  values
    (
      '2026-09-09',
      'Emmanuel covers John — Tinashe Hub Bespoke 4.30–6 2026-09-09',
      '2026-09-09|16:30|tinashe|john'
    ),
    (
      '2026-09-16',
      'Emmanuel covers John — Tinashe Hub Bespoke 4.30–6 2026-09-16',
      '2026-09-16|16:30|tinashe|john'
    )
) as v(session_date, reason, portal_session_key)
where not exists (
  select 1
  from public.schedule_overrides o
  where o.status = 'active'
    and o.override_type = 'instructor_reassign'
    and o.session_date = v.session_date::date
    and lower(coalesce(o.anchor_staff_id, '')) = 'john'
    and lower(coalesce(o.anchor_client_id, '')) = 'tinashe'
);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select session_date, override_type, status, count(*)
from public.schedule_overrides
where spreadsheet_revision = 'office:void-capacity-chain-redundant-overrides-20260914'
group by 1, 2, 3
order by 1, 2;
