-- Aqsa absent + Yossi make-up with Aurora · Thu 2026-06-11 · 4.30–5 Acton.
-- Fixes admin labels (Thursday · 16.30…) so staff tablet matcher sees roster slot.
-- Run: npx supabase db query --linked -f database/local-vault/step-aqsa-yossi-makeup-2026-06-11.sql

begin;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Drop duplicate full-hour replace (keep the 4.30–5 make-up row).
update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid
where id = '31b5cfc4-4837-4b12-90c6-04e49f96b134';

-- Normalise surviving rows to roster slot label + anchors.
update public.schedule_overrides
set
  anchor_time_slot_label = '4.30 to 5.30',
  reason = coalesce(nullif(trim(reason), ''), 'Aqsa absent'),
  updated_at = now(),
  updated_by = 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid
where id = 'e4920214-0f90-471c-a6b3-8e837a93b354'
  and status = 'active';

update public.schedule_overrides
set
  anchor_time_slot_label = '4.30 to 5.30',
  anchor_end = time '17:00',
  reason = 'Yossi make-up 4.30–5 with Aurora (Aqsa absent)',
  payload = jsonb_build_object(
    'replacement_client_id', 'yossi',
    'replacement_client_name', 'Yossi',
    'to_client_id', 'yossi',
    'to_client_name', 'Yossi',
    'makeup_window', '4.30 to 5'
  ),
  updated_at = now(),
  updated_by = 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid
where id = '8043cb27-0b30-46d3-a762-8bf8c942887d'
  and status = 'active';

-- Allow roster push to fire again for both alerts.
delete from public.portal_webpush_override_sent
where override_id in (
  'e4920214-0f90-471c-a6b3-8e837a93b354',
  '8043cb27-0b30-46d3-a762-8bf8c942887d'
);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select id, override_type, status, anchor_time_slot_label, anchor_start, anchor_end, reason
from public.schedule_overrides
where session_date = '2026-06-11'
  and anchor_staff_id = 'aurora'
  and anchor_client_id = 'aqsa'
order by created_at;
