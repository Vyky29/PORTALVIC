-- Andres Borrego: no summer term 2026 work.
-- Keep staff_profiles / portal login active for staff_profile_update + 2026/27 availability.
-- Cancel leftover instructor_reassign anchors still pointing at andres (e.g. 21 Jun covers).

begin;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = created_by
where status = 'active'
  and lower(trim(anchor_staff_id)) = 'andres';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
