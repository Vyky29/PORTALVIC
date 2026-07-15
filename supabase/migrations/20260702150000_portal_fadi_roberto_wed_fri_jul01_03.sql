-- Fadi Day Centre split shifts (Roberto 12.30–3 + Youssef 1–3) for Wed/Fri week of 2026-07-01.
-- Wed 2026-07-01 had Roberto 12.30–3 cancelled while Youssef 1–3 stayed active, hiding Fadi from Roberto in admin Overview.

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

-- Wed 1 Jul: restore Roberto morning block (mirror Mon 2026-06-29 pattern).
update public.portal_roster_rows
set status = 'active',
    instructors = 'ROBERTO',
    updated_at = now(),
    updated_by = (select id from _portal_actor)
where id = '20166641-61cd-4e69-895b-008e3f87fc1a'::uuid;

insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select
  'Fadi', 'Wednesday', '12.30 to 3', 'ROBERTO', 'Day Centre', 'Hub Room', 'SwimFarm',
  '2026-07-01'::date, 'active', (select id from _portal_actor), (select id from _portal_actor)
where not exists (
  select 1
  from public.portal_roster_rows r
  where r.status = 'active'
    and r.session_date = '2026-07-01'::date
    and lower(trim(r.client_name)) = 'fadi'
    and lower(trim(r.time_slot)) = '12.30 to 3'
    and lower(trim(r.instructors)) like '%roberto%'
);

-- Fri 3 Jul: split Roberto + Youssef (Youssef also supports Ikram / Emanuel earlier).
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select
  'Fadi', 'Friday', '12.30 to 3', 'ROBERTO', 'Day Centre', 'Hub Room', 'SwimFarm',
  '2026-07-03'::date, 'active', (select id from _portal_actor), (select id from _portal_actor)
where not exists (
  select 1
  from public.portal_roster_rows r
  where r.status = 'active'
    and r.session_date = '2026-07-03'::date
    and lower(trim(r.client_name)) = 'fadi'
    and lower(trim(r.time_slot)) = '12.30 to 3'
    and lower(trim(r.instructors)) like '%roberto%'
);

insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select
  'Fadi', 'Friday', '1 to 3', 'YOUSSEF', 'Day Centre', 'Hub Room', 'SwimFarm',
  '2026-07-03'::date, 'active', (select id from _portal_actor), (select id from _portal_actor)
where not exists (
  select 1
  from public.portal_roster_rows r
  where r.status = 'active'
    and r.session_date = '2026-07-03'::date
    and lower(trim(r.client_name)) = 'fadi'
    and lower(trim(r.time_slot)) = '1 to 3'
    and lower(trim(r.instructors)) like '%youssef%'
);

commit;
