-- Chaitanya trial Sun 28 Jun 2026 3–4pm: open roster cell + schedule_override (purple Trial), same pattern as Eddie Ri / Youssef.
-- Roster row was booked as "Chaitanya (Trial 28/06)" (green Booked); trials use NO PARTICIPANT + is_trial override.

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

update public.portal_roster_rows
set
  client_name = 'NO PARTICIPANT',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where status = 'active'
  and session_date = '2026-06-28'::date
  and lower(trim(instructors)) like '%carlos%'
  and lower(trim(time_slot)) = '3 to 4'
  and lower(trim(venue)) = 'westway'
  and lower(trim(client_name)) like '%chaitanya%';

insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select
  'NO PARTICIPANT', 'Sunday', '3 to 4', 'CARLOS', 'Climbing Activity', 'Wall', 'Westway',
  '2026-06-28'::date, 'active', (select id from _portal_actor), (select id from _portal_actor)
where exists (select 1 from _portal_actor)
  and not exists (
    select 1 from public.portal_roster_rows r
    where r.status = 'active'
      and r.session_date = '2026-06-28'::date
      and lower(trim(r.instructors)) like '%carlos%'
      and lower(trim(r.time_slot)) = '3 to 4'
      and lower(trim(r.venue)) = 'westway'
      and lower(trim(r.client_name)) in ('no participant', 'no client', 'noclient', 'no_participant', '')
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
  '2026-06-28'::date,
  'carlos',
  '15:00:00'::time,
  '16:00:00'::time,
  'Westway',
  'available',
  '3 to 4',
  'client_replace_in_slot',
  jsonb_build_object(
    'booking_kind', 'trial',
    'is_trial', true,
    'replacement_client_id', 'chaitanya_trial_28_06',
    'replacement_client_name', 'Chaitanya (Trial 28/06)',
    'to_client_id', 'chaitanya_trial_28_06',
    'to_client_name', 'Chaitanya (Trial 28/06)'
  ),
  'Trial — Chaitanya Marasini climbing Westway Wall',
  'active',
  'migration:20260615193000_chaitanya_trial_override',
  (select id from _portal_actor),
  (select id from _portal_actor)
where exists (select 1 from _portal_actor)
  and not exists (
    select 1
    from public.schedule_overrides so
    where so.status = 'active'
      and so.session_date = '2026-06-28'::date
      and lower(trim(so.anchor_staff_id)) = 'carlos'
      and so.anchor_start = '15:00:00'::time
      and so.anchor_end = '16:00:00'::time
      and lower(trim(so.anchor_venue)) = 'westway'
      and so.override_type = 'client_replace_in_slot'
      and coalesce(so.payload->>'is_trial', 'false') = 'true'
  );

commit;
