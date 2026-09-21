-- Tue 8 Acton: restore instructor chip chain for Schedule & Covers.
-- Adam / Anas: Aurora / Javi (red) → current cover (green)
-- Aydaan: Roberto (red, term book) → Luliya (green, today cover)
-- Run: npx supabase db query --linked -f database/local-vault/office-tue8-prior-javi-cover-chain-20260908.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Adam + Anas: standing Aurora, first cover Javi, then redistributed
update public.schedule_overrides
set
  payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
    'prior_covering_staff_id', 'javi',
    'prior_covering_staff_name', 'Javi',
    'prior_covering_staff_ids', jsonb_build_array('javi'),
    'prior_covering_staff_names', jsonb_build_array('Javi')
  ),
  spreadsheet_revision = 'office:tue8-prior-javi-cover-chain-20260908',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where session_date = '2026-09-08'
  and status = 'active'
  and override_type = 'instructor_reassign'
  and lower(anchor_staff_id) = 'aurora'
  and lower(anchor_client_id) in ('adam_mahmmoud', 'anas')
  and lower(coalesce(payload->>'covering_staff_id', '')) <> 'javi';

-- Aydaan: term book = Roberto; today cover = Luliya (parent WA narrative)
update public.schedule_overrides
set
  payload = coalesce(payload, '{}'::jsonb)
    - 'prior_covering_staff_id'
    - 'prior_covering_staff_name'
    || jsonb_build_object(
      'display_from_staff_id', 'roberto',
      'display_from_staff_name', 'Roberto',
      'prior_covering_staff_ids', '[]'::jsonb,
      'prior_covering_staff_names', '[]'::jsonb
    ),
  spreadsheet_revision = 'office:tue8-prior-javi-cover-chain-20260908',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where session_date = '2026-09-08'
  and status = 'active'
  and override_type = 'instructor_reassign'
  and lower(anchor_staff_id) = 'aurora'
  and lower(anchor_client_id) = 'aydaan_ah';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
