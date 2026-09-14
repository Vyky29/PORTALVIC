-- Sun 13 Sep: re-activate Luliya cover for Simon Aquatic 9-9.30.
-- Was cancelled while the other 8 Aurora→Luliya covers stayed active.
--
--   npx supabase db query --linked -f database/local-vault/office-reactivate-simon-luliya-sun13-20260914.sql

begin;

create temp table _portal_actor on commit drop as
select 'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid as id;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  status = 'active',
  reason = 'Luliya covers Aurora — Simon Aquatic 9–9.30 2026-09-13',
  spreadsheet_revision = 'office:reactivate-simon-luliya-sun13-20260914',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where id = 'daf64540-295c-410a-a121-a5e27ab1e324'::uuid
  and override_type = 'instructor_reassign'
  and session_date = '2026-09-13'::date
  and anchor_client_id = 'simon'
  and coalesce(payload->>'covering_staff_id', '') = 'luliya';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select id, status, session_date, override_type, anchor_staff_id, anchor_client_id,
       payload->>'covering_staff_id' as cover, reason, spreadsheet_revision
from public.schedule_overrides
where id = 'daf64540-295c-410a-a121-a5e27ab1e324'::uuid;
