-- Wednesday 2026-07-01 Day Centre / pool access for Youssef (SwimFarm morning).
-- Split Ikram 11–12, Emanuel 12–1 (Big Pool), Fadi 1–3 — same pattern as Mon 29 Jun.
-- Run: npx supabase db query --linked -f database/local-vault/step-2026-07-01-youssef-day-centre-roster.sql

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
where session_date = '2026-07-01'::date
  and lower(trim(client_name)) in ('ikram', 'emanuel', 'fadi')
  and status = 'active'
  and exists (select 1 from _portal_actor);

-- Cancel thick bundle / MADRE rows for this calendar day.
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, 'Wednesday', v.time_slot, v.instructors, v.service, v.area, 'SwimFarm', '2026-07-01'::date, 'cancelled', a.id, a.id
from _portal_actor a
cross join (
  values
    ('Ikram', '11 to 4', 'LULIA, MICHELLE', 'Day Centre', 'Hub Room'),
    ('Ikram', '11 to 4', 'LULIA, YOUSSEF', 'Day Centre', 'Hub Room'),
    ('Ikram', '11 to 4', 'YOUSSEF', 'Day Centre', 'Hub Room'),
    ('Emanuel', '11 to 4', 'MICHELLE', 'Day Centre', 'Hub Room'),
    ('Fadi', '12.30 to 3', 'ROBERTO, YOUSSEF', 'Day Centre', 'Hub Room'),
    ('Fadi', '12.30 to 3', 'ROBERTO, VICTOR', 'Day Centre', 'Hub Room')
) as v(client_name, time_slot, instructors, service, area);

-- Youssef morning split (Wed 1 Jul).
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, 'Wednesday', v.time_slot, v.instructors, v.service, v.area, 'SwimFarm', '2026-07-01'::date, 'active', a.id, a.id
from _portal_actor a
cross join (
  values
    ('Ikram', '11 to 12', 'YOUSSEF', 'Day Centre', 'Hub Room'),
    ('Emanuel', '12 to 1', 'YOUSSEF', 'Aquatic Activity', 'Big Pool'),
    ('Fadi', '1 to 3', 'YOUSSEF', 'Day Centre', 'Hub Room')
) as v(client_name, time_slot, instructors, service, area);

commit;

select client_name, time_slot, instructors, service, area, status
from public.portal_roster_rows
where session_date = '2026-07-01'::date
  and lower(trim(client_name)) in ('ikram', 'emanuel', 'fadi')
order by status desc, time_slot, client_name, instructors;
