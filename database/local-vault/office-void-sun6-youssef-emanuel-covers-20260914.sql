-- Sun 6 Sep 2026: void stale Youssef→Emanuel Hub Multi covers.
-- Truth: Youssef OFF; Jack S / Zaid / Eiji / Hazem / Haneef / Rayyan F are Javier's
-- Multi book. John covers Emmanuel Hub that day (canonical dated rows).
--
--   npx supabase db query --linked -f database/local-vault/office-void-sun6-youssef-emanuel-covers-20260914.sql

begin;

create temp table _portal_actor on commit drop as
select 'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid as id;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — Sun 6 Youssef OFF; Hub Multi kids are Javier book (John covers Emmanuel)',
  spreadsheet_revision = 'office:void-sun6-youssef-emanuel-covers-20260914',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where status = 'active'
  and session_date = '2026-09-06'::date
  and override_type = 'instructor_reassign'
  and lower(coalesce(anchor_staff_id, '')) in ('emanuel', 'emmanuel')
  and lower(coalesce(payload->>'covering_staff_id', '')) = 'youssef';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
