-- Chaitanya trial: revert pre-assigned override so admin assigns manually (Eddie Ri pattern).
-- Keep Carlos · Sun 28 Jun 2026 · 3–4 · Westway · Wall as NO PARTICIPANT open cell.

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = created_by
where status = 'active'
  and session_date = '2026-06-28'::date
  and lower(trim(anchor_staff_id)) = 'carlos'
  and lower(trim(anchor_venue)) = 'westway'
  and anchor_start = '15:00:00'::time
  and anchor_end = '16:00:00'::time
  and override_type = 'client_replace_in_slot'
  and coalesce(payload->>'is_trial', 'false') = 'true'
  and (
    lower(coalesce(payload->>'to_client_name', '')) like '%chaitanya%'
    or lower(coalesce(payload->>'replacement_client_name', '')) like '%chaitanya%'
  );

update public.portal_roster_rows
set
  client_name = 'NO PARTICIPANT',
  service = 'Climbing Activity',
  area = 'Wall',
  instructors = 'CARLOS',
  venue = 'Westway',
  day = 'Sunday',
  time_slot = '3 to 4',
  updated_at = now(),
  updated_by = coalesce((select id from _portal_actor), portal_roster_rows.updated_by, portal_roster_rows.created_by)
where status = 'active'
  and session_date = '2026-06-28'::date
  and lower(trim(instructors)) like '%carlos%'
  and lower(trim(venue)) = 'westway'
  and lower(trim(time_slot)) = '3 to 4';

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
      and lower(trim(r.venue)) = 'westway'
      and lower(trim(r.time_slot)) = '3 to 4'
  );

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
