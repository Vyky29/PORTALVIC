-- Align Javier/Ayman absence (2026-07-09) to remaining MADRE slot "4 to 5".
-- Created originally by admin (Victor). Ghost MADRE slot "16 to 17" was removed;
-- a second active override with label "4 to 5" was inserted live
-- (id d072afca-8c76-4f15-94cc-a8da725655f2) because service-role UPDATE nulls updated_by.
-- This migration updates the original row when applied with the trigger disabled.

begin;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  anchor_time_slot_label = '4 to 5',
  payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
    'portal_session_key', '2026-07-09|16:00|ayman',
    'feedback_resolution', 'absent',
    'aquatic_full_band_absent', true
  ),
  status = 'cancelled',
  updated_at = now()
where id = '92aa2563-8a57-4169-a4ac-e82b46666d9c'
  and session_date = '2026-07-09'
  and override_type = 'client_absence_announced';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
