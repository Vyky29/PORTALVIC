-- Fadi Day Centre 12.30–3 on 2026-06-03: Roberto + Raul only (remove Youssef for today).

begin;

update public.portal_roster_rows
set instructors = 'ROBERTO, RAUL', updated_at = now()
where status = 'active'
  and session_date = '2026-06-03'::date
  and lower(trim(client_name)) = 'fadi'
  and lower(trim(time_slot)) like '%12.30%'
  and lower(trim(time_slot)) like '%3%'
  and lower(trim(venue)) in ('swimfarm', 'swim farm');

insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status
)
select
  'Fadi', 'Wednesday', '12.30 to 3', 'ROBERTO, RAUL', 'Day Centre', 'Hub Room', 'SwimFarm',
  '2026-06-03'::date, 'active'
where not exists (
  select 1 from public.portal_roster_rows r
  where r.status = 'active'
    and r.session_date = '2026-06-03'::date
    and lower(trim(r.client_name)) = 'fadi'
    and lower(trim(r.time_slot)) = '12.30 to 3'
);

commit;
