-- Cancel Luliya's remaining shadowing sessions (2026-07-13 & 2026-07-15).
-- 2026-07-06 and 2026-07-08 were already cancelled; this completes "Luliya has no
-- shadowing". CLI updates need the updated_by trigger disabled (it sets
-- updated_by := auth.uid(), which is NULL over a direct/service connection).

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set status = 'cancelled',
    updated_by = coalesce(updated_by, created_by, 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid),
    reason = '[voided 2026-07-08: Luliya shadowing cancelled in full]'
where id in (
  '2e923130-11ee-4221-938a-87cd85e25edc', -- 2026-07-13 shadowing @Northolt
  'bac09dff-3f15-47a0-912f-028bfd29de0b'  -- 2026-07-15 shadowing @Northolt
)
  and override_type = 'session_add'
  and status = 'active';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

select session_date, status, anchor_staff_id, payload->>'kind' as kind
from public.schedule_overrides
where override_type = 'session_add'
  and payload->>'kind' = 'shadowing'
  and lower(regexp_replace(coalesce(anchor_staff_id,''), '[^a-z0-9]', '', 'g')) = 'lulia'
order by session_date;
