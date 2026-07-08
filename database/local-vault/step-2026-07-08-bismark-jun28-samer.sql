-- Bismark Jun 28 2026: roster hub slot is Samer 9:30 but he covered Jack S Big Pool (Javier).
-- Giuseppe had Samer at 10:15 hub and submitted that feedback.
-- Jack S feedback was stored under Luliya — reassign to Bismark.
-- Mark Bismark Samer hub slot cancelled for feedback so dashboard stops nagging.

begin;

update public.session_feedback
set submitted_by_user_id = '09cc34eb-7824-4f54-b4a0-b2b3205425ca'::uuid,
    completed_by_name = 'Bismark Gyan'
where id = '76a91dc5-2117-4104-8eaf-c25613075b94'
  and session_date = '2026-06-28'
  and portal_session_key = '2026-06-28|09:30|jack_s|big_pool';

insert into public.schedule_overrides (
  session_date,
  anchor_staff_id,
  anchor_start,
  anchor_end,
  anchor_venue,
  anchor_client_id,
  anchor_time_slot_label,
  override_type,
  payload,
  reason,
  status,
  created_by,
  updated_by
)
select
  '2026-06-28'::date,
  'bismark',
  '09:30:00'::time,
  '10:15:00'::time,
  'SwimFarm',
  'samer',
  '9.30 to 10.15',
  'slot_clear_client',
  jsonb_build_object(
    'cancelled_by_admin', true,
    'feedback_resolution', 'cancelled',
    'portal_session_key', '2026-06-28|09:30|samer|hub_room'
  ),
  '[2026-07-08: Bismark covered Jack S Big Pool; Samer hub slot not taught — Giuseppe had Samer 10:15]',
  'active',
  'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid,
  'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid
where not exists (
  select 1 from public.schedule_overrides o
  where o.session_date = '2026-06-28'
    and o.anchor_staff_id = 'bismark'
    and o.anchor_client_id = 'samer'
    and o.anchor_start = '09:30:00'::time
    and o.status = 'active'
    and o.override_type = 'slot_clear_client'
);

commit;
