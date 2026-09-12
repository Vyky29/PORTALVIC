-- Finish Muhammad climb trial move to Alex 12-1 Sun 13 (after partial deno apply).
-- Run: npx supabase db query --linked -f database/local-vault/office-muhammad-climb-trial-noon-finish-20260913.sql

begin;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — Muhammad climb trial moved to Alex 12-1 Sun 13',
  spreadsheet_revision = 'office:muhammad-climb-trial-noon-20260913',
  updated_at = now()
where session_date = '2026-09-13'
  and override_type = 'client_replace_in_slot'
  and lower(anchor_staff_id) = 'carlos'
  and anchor_start = '14:00:00'
  and status = 'active'
  and (
    lower(coalesce(payload->>'to_client_id', '')) = 'muhammad'
    or lower(coalesce(payload->>'replacement_client_id', '')) = 'muhammad'
  );

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
  spreadsheet_revision,
  created_by,
  updated_by
)
select
  '2026-09-13'::date,
  'alex',
  '12:00:00'::time,
  '13:00:00'::time,
  'Westway',
  'available',
  '12 to 1',
  'client_replace_in_slot',
  jsonb_build_object(
    'is_trial', true,
    'booking_kind', 'trial',
    'session_kind', 'trial',
    'to_client_id', 'muhammad',
    'to_client_name', 'Muhammad (Trial)',
    'replacement_client_id', 'muhammad',
    'replacement_client_name', 'Muhammad (Trial)',
    'finish_booking', true,
    'office_move_climb_noon_20260913', true
  ),
  'Finish booking trial · Muhammad · Westway · 12.00 – 1.00 · Alex (moved from Carlos 2-3)',
  'active',
  'office:muhammad-climb-trial-noon-20260913',
  'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid,
  'a0d439df-3a8f-439d-b427-b3459552eae1'::uuid
where not exists (
  select 1
  from public.schedule_overrides so
  where so.session_date = '2026-09-13'
    and so.status = 'active'
    and so.override_type = 'client_replace_in_slot'
    and lower(so.anchor_staff_id) = 'alex'
    and so.anchor_start = '12:00:00'
    and lower(coalesce(so.payload->>'to_client_id', '')) = 'muhammad'
);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

update public.portal_participant_service_lines
set
  sessions = '[
    {"day":"Sunday","area":"Wall","venue":"Westway","weeks":1,"isTrial":true,"service":"Climbing Activity","timeSlot":"12.00 – 13.00","instructor":"Alex","durationMin":60,"dateIso":"2026-09-13"},
    {"day":"Monday","area":"Teaching Pool","venue":"Northolt","service":"Aquatic Activity","timeSlot":"4.30 – 5.00","instructor":"Dan","durationMin":30}
  ]'::jsonb,
  services_count = 2,
  source = 'office:muhammad-climb-trial-noon-20260913',
  updated_at = now()
where client_key = 'muhammad';

update public.portal_booking_slot_reservations
set
  date_iso = '2026-09-13',
  day_label = 'Sunday',
  time_label = '12.00 – 13.00',
  venue = 'Westway',
  slot_id = 'live-climbing-westway-sunday-12-00-12-00-1-00',
  notes = coalesce(notes, '') || '|moved_to_alex_noon_20260913',
  updated_at = now()
where lower(participant_name) like 'muhammad%'
  and lower(service_name) like '%climb%'
  and status in ('validated', 'held', 'confirmed', 'paid')
  and (
    date_iso is distinct from '2026-09-13'
    or time_label not ilike '%12.00%'
  );

commit;

select id::text, client_name, session_date::text, time_slot, instructors
from public.portal_roster_rows
where lower(client_name) like '%muhammad%'
  and status = 'active'
order by session_date nulls last;

select id::text, anchor_staff_id, anchor_start::text, status, payload->>'to_client_id' as client
from public.schedule_overrides
where session_date = '2026-09-13'
  and override_type = 'client_replace_in_slot'
  and (
    lower(coalesce(payload->>'to_client_id','')) = 'muhammad'
    or lower(anchor_staff_id) in ('alex','carlos')
  );

select client_key, sessions
from public.portal_participant_service_lines
where client_key = 'muhammad';
