-- Chaitanya trial Sun 28 Jun 2026: Carlos / Westway = Climbing (never Aquatic default on override).
-- CLI: disable updated_by trigger (sets auth.uid() which is null outside dashboard).

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
    'service', 'Climbing Activity',
    'area', 'Wall',
    'roster_service', 'Climbing Activity'
  ),
  updated_at = now(),
  updated_by = coalesce(created_by, 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid)
where status = 'active'
  and session_date = '2026-06-28'::date
  and lower(trim(anchor_staff_id)) = 'carlos'
  and lower(trim(anchor_venue)) = 'westway'
  and lower(coalesce(payload->>'replacement_client_id', payload->>'to_client_id', '')) = 'chaitanya';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;
