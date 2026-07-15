-- Monday 2026-06-29 Day Centre / pool access update.
-- Carlos covers Luliya; pool access moves 30 minutes earlier.
-- Run: npx supabase db query --linked -f database/local-vault/step-2026-06-29-day-centre-roster.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

-- Retire any previous live edits for the same operational block.
update public.portal_roster_rows
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where session_date = '2026-06-29'::date
  and lower(trim(client_name)) in ('acat', 'ikram', 'emanuel', 'timi', 'fadi', 'home', 'manager')
  and status = 'active'
  and exists (select 1 from _portal_actor);

-- Cancel old bundle/base rows that must disappear from Overview.
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, 'Monday', v.time_slot, v.instructors, v.service, v.area, 'SwimFarm', '2026-06-29'::date, 'cancelled', a.id, a.id
from _portal_actor a
cross join (
  values
    ('ACAT', '11 to 12', 'ROBERTO', 'Day Centre', 'Hub Room'),
    ('Ikram', '11 to 4', 'LULIA, MICHELLE', 'Day Centre', 'Hub Room'),
    ('Emanuel', '11 to 4', 'MICHELLE', 'Day Centre', 'Hub Room'),
    ('Timi', '1 to 3', 'RAUL', 'Day Centre', 'Hub Room'),
    ('Fadi', '12.30 to 3', 'ROBERTO, VICTOR', 'Day Centre', 'Hub Room'),
    ('HOME', '11 to 1', 'VICTOR', 'Day Centre', 'HOME')
) as v(client_name, time_slot, instructors, service, area);

-- New actual rota for Monday 29 Jun.
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, 'Monday', v.time_slot, v.instructors, v.service, v.area, 'SwimFarm', '2026-06-29'::date, 'active', a.id, a.id
from _portal_actor a
cross join (
  values
    ('ACAT', '11 to 12', 'ROBERTO', 'Aquatic Activity', 'Big Pool'),
    ('Ikram', '11 to 12', 'YOUSSEF, CARLOS', 'Day Centre', 'Hub Room'),
    ('Emanuel', '11 to 12', 'MICHELLE', 'Day Centre', 'Hub Room'),
    ('Timi', '11 to 1', 'VICTOR', 'Day Centre', 'Hub Room'),
    ('Ikram', '12 to 4', 'MICHELLE, CARLOS', 'Day Centre', 'Hub Room'),
    ('Emanuel', '12 to 1', 'YOUSSEF', 'Aquatic Activity', 'Big Pool'),
    ('Timi', '12 to 12.30', 'ROBERTO', 'Aquatic Activity', 'Big Pool'),
    ('Fadi', '12.30 to 3', 'ROBERTO', 'Day Centre', 'Hub Room'),
    ('Fadi', '1 to 3', 'YOUSSEF', 'Day Centre', 'Hub Room'),
    ('Emanuel', '1 to 4', 'VICTOR', 'Day Centre', 'Hub Room'),
    ('HOME', '11 to 1', 'RAUL', 'Day Centre', 'HOME'),
    ('MANAGER', '1 to 4', 'RAUL', 'Manager', 'Manager')
) as v(client_name, time_slot, instructors, service, area);

commit;

select client_name, time_slot, instructors, service, area, status
from public.portal_roster_rows
where session_date = '2026-06-29'::date
  and lower(trim(client_name)) in ('acat', 'ikram', 'emanuel', 'timi', 'fadi', 'home', 'manager')
order by status desc, time_slot, client_name, instructors;
