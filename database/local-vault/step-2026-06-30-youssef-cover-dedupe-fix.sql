-- Fix: keep aurora-anchored Youssef covers on 28-Jun; cancel stale dan-anchored duplicates.

begin;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Re-activate aurora rows (wrongly cancelled in prior dedupe pass)
update public.schedule_overrides
set status = 'active',
    updated_by = 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid,
    updated_at = now()
where session_date = '2026-06-28'::date
  and override_type = 'instructor_reassign'
  and status = 'cancelled'
  and lower(trim(anchor_staff_id)) = 'aurora'
  and payload->>'covering_staff_id' = 'youssef';

-- Cancel dan-anchored duplicates (stale anchor before aurora fix)
update public.schedule_overrides
set status = 'cancelled',
    updated_by = 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid,
    updated_at = now(),
    reason = '[voided 2026-06-30: stale dan anchor; aurora row is canonical for Youssef cover 28-Jun]'
where session_date = '2026-06-28'::date
  and override_type = 'instructor_reassign'
  and status = 'active'
  and lower(trim(anchor_staff_id)) = 'dan'
  and payload->>'covering_staff_id' = 'youssef';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select anchor_staff_id, anchor_client_id, to_char(anchor_start,'HH24:MI') as st, status
from public.schedule_overrides
where session_date = '2026-06-28'
  and override_type = 'instructor_reassign'
  and payload->>'covering_staff_id' = 'youssef'
order by anchor_start, status desc, anchor_staff_id;
