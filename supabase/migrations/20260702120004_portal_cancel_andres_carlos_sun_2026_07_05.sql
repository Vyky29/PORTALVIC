-- Cancel wrong Sevitha schedule_overrides for Sun 2026-07-05 Westway climbing.
-- Correct roster: Alex + Bismark (Bismark covers Carlos template slots); lead Berta not John.
-- Andrés does not work this Sunday.

begin;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = created_by
where status = 'active'
  and session_date = '2026-07-05'::date
  and lower(trim(anchor_staff_id)) = 'andres'
  and lower(trim(anchor_venue)) = 'westway'
  and override_type = 'instructor_reassign'
  and lower(coalesce(payload->>'covering_staff_id', '')) = 'carlos';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
