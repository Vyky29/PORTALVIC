-- Fadi Monday 12.30–3: Roberto + Raul only (remove Youssef from templates/dated overrides).
-- Stops portal_roster_rows weekly templates from reassigning Fadi to Youssef on staff dashboards.

begin;

update public.portal_roster_rows
set status = 'cancelled', updated_at = now()
where status = 'active'
  and lower(trim(client_name)) = 'fadi'
  and lower(trim(day)) = 'monday'
  and lower(trim(time_slot)) = '12.30 to 3'
  and lower(trim(instructors)) like '%youssef%';

insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status
)
select
  'Fadi', 'Monday', '12.30 to 3', 'ROBERTO, RAUL', 'Day Centre', 'Hub Room', 'SwimFarm',
  null, 'active'
where not exists (
  select 1 from public.portal_roster_rows r
  where r.status = 'active'
    and r.session_date is null
    and lower(trim(r.day)) = 'monday'
    and lower(trim(r.client_name)) = 'fadi'
    and lower(trim(r.time_slot)) = '12.30 to 3'
);

update public.portal_roster_rows
set
  instructors = 'ROBERTO, RAUL',
  service = 'Day Centre',
  area = 'Hub Room',
  venue = 'SwimFarm',
  updated_at = now()
where status = 'active'
  and session_date is null
  and lower(trim(day)) = 'monday'
  and lower(trim(client_name)) = 'fadi'
  and lower(trim(time_slot)) = '12.30 to 3';

update public.portal_roster_rows
set instructors = 'ROBERTO, RAUL', updated_at = now()
where status = 'active'
  and session_date is not null
  and session_date >= '2026-06-01'::date
  and lower(trim(day)) = 'monday'
  and lower(trim(client_name)) = 'fadi'
  and lower(trim(time_slot)) = '12.30 to 3'
  and lower(trim(instructors)) like '%youssef%';

commit;
