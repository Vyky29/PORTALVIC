-- Sun 6 Sep 2026: Emanuel Hub Multi cover must be Youssef (not John).
-- John keeps his own Hub book (Jack W…Aydaan Ah). Berta = Leader only.
-- Service-role UPDATE nulls updated_by via trigger — disable while patching.

begin;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides so
set
  payload = jsonb_set(
    coalesce(so.payload, '{}'::jsonb),
    '{covering_staff_id}',
    '"youssef"'::jsonb,
    true
  ),
  reason = 'Youssef covers Emanuel Sunday Multi Hub SwimFarm 2026-09-06',
  spreadsheet_revision = 'office:youssef-covers-emanuel-sun-2026-09-06',
  updated_at = now(),
  updated_by = coalesce(so.updated_by, so.created_by)
where so.session_date = '2026-09-06'
  and so.override_type = 'instructor_reassign'
  and so.status = 'active'
  and lower(coalesce(so.payload->>'covering_staff_id', '')) = 'john'
  and lower(coalesce(so.anchor_client_id, '')) in (
    'zaid', 'samer', 'eiji', 'hazem', 'haneef', 'rayyan_f'
  )
  and lower(coalesce(so.anchor_staff_id, '')) in ('emanuel', 'giuseppe');

update public.schedule_overrides so
set
  payload = jsonb_set(
    coalesce(so.payload, '{}'::jsonb),
    '{covering_staff_name}',
    '"Youssef"'::jsonb,
    true
  ),
  updated_at = now(),
  updated_by = coalesce(so.updated_by, so.created_by)
where so.session_date = '2026-09-06'
  and so.override_type = 'instructor_reassign'
  and so.status = 'active'
  and lower(coalesce(so.payload->>'covering_staff_id', '')) = 'youssef'
  and lower(coalesce(so.anchor_client_id, '')) in (
    'zaid', 'samer', 'eiji', 'hazem', 'haneef', 'rayyan_f'
  );

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
