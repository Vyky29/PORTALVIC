-- Roster notes/area fixes: Scott (Wed, Youssef) Teaching Pool; Sunday SwimFarm 2–3 slots Teaching Pool.
-- Merges over spreadsheet bundle via portal_roster_rows (template + dated).

begin;

update public.portal_roster_rows
set area = 'Teaching Pool', updated_at = now()
where status = 'active'
  and lower(trim(day)) = 'wednesday'
  and lower(trim(client_name)) = 'scott'
  and lower(trim(time_slot)) like '%5.15%'
  and lower(trim(time_slot)) like '%6%'
  and lower(trim(instructors)) like '%youssef%'
  and lower(trim(area)) = 'room 2';

update public.portal_roster_rows
set area = 'Teaching Pool', updated_at = now()
where status = 'active'
  and lower(trim(day)) = 'sunday'
  and lower(trim(venue)) in ('swimfarm', 'swim farm')
  and lower(trim(area)) = 'big pool'
  and (
    lower(trim(time_slot)) in ('2 to 2.30', '2 to 2:30', '2.30 to 3', '2:30 to 3')
  );

insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status
)
select 'Scott', 'Wednesday', '5.15 to 6', 'YOUSSEF', 'Multi-Activity', 'Teaching Pool', 'Acton', null, 'active'
where not exists (
  select 1 from public.portal_roster_rows r
  where r.status = 'active' and r.session_date is null
    and lower(trim(r.day)) = 'wednesday'
    and lower(trim(r.client_name)) = 'scott'
    and lower(trim(r.time_slot)) = '5.15 to 6'
);

update public.portal_roster_rows
set area = 'Teaching Pool', instructors = 'YOUSSEF', service = 'Multi-Activity', venue = 'Acton', updated_at = now()
where status = 'active' and session_date is null
  and lower(trim(day)) = 'wednesday'
  and lower(trim(client_name)) = 'scott'
  and lower(trim(time_slot)) = '5.15 to 6';

commit;
