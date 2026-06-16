-- Trial Chaitanya Marasini — Sunday 28 Jun 2026, 3–4pm: Climbing at Westway Wall with Carlos.
-- Roberto finishes at 3pm at SwimFarm (Yoan 2.30–3); trial is climbing, not Multi-Activity Hub Room.

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

update public.portal_roster_rows
set
  service = 'Climbing Activity',
  venue = 'Westway',
  area = 'Wall',
  instructors = 'CARLOS',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where status = 'active'
  and session_date = '2026-06-28'::date
  and lower(trim(client_name)) = 'chaitanya (trial 28/06)'
  and lower(trim(time_slot)) = '3 to 4';

insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select
  'Chaitanya (Trial 28/06)', 'Sunday', '3 to 4', 'CARLOS', 'Climbing Activity', 'Wall', 'Westway',
  '2026-06-28'::date, 'active', (select id from _portal_actor), (select id from _portal_actor)
where not exists (
  select 1 from public.portal_roster_rows r
  where r.status = 'active'
    and r.session_date = '2026-06-28'::date
    and lower(trim(r.client_name)) = 'chaitanya (trial 28/06)'
    and lower(trim(r.time_slot)) = '3 to 4'
);

commit;
