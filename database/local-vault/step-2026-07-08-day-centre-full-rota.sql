-- 2026-07-08 (Wed) Day Centre full rota correction.
-- Base bundle for this future week is wrong (Youssef on Emanuel/Fadi, Roberto on
-- Fadi, HOME Victor, Emanuel only 11-1). Correct staffing:
--   Ikram   11-3 Luliya + Youssef ; 3-4 Victor            (set in prior step)
--   Emanuel 11-3 Victor          ; 3-4 Raul
--   Fadi    12.30-3 Raul
--   (Youssef finishes at 3 with Ikram; Roberto not in Day Centre; HOME dropped)
-- Run: npx supabase db query --linked -f database/local-vault/step-2026-07-08-day-centre-full-rota.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

-- Retire prior live edits for these clients on this date (keep Ikram from prior step).
update public.portal_roster_rows
set status = 'cancelled', updated_at = now(), updated_by = (select id from _portal_actor)
where session_date = '2026-07-08'::date
  and lower(trim(client_name)) in ('emanuel', 'fadi', 'home')
  and status = 'active'
  and exists (select 1 from _portal_actor);

-- Cancel the wrong base bundle slots (dated cancelled rows suppress by client+time).
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, 'Wednesday', v.time_slot, v.instructors, v.service, v.area, 'SwimFarm', '2026-07-08'::date, 'cancelled', a.id, a.id
from _portal_actor a
cross join (
  values
    ('Emanuel', '11 to 1', 'YOUSSEF', 'Day Centre', 'Hub Room'),
    ('Fadi', '1 to 3', 'YOUSSEF', 'Day Centre', 'Hub Room'),
    ('Fadi', '12.30 to 3', 'RAUL, ROBERTO', 'Day Centre', 'Hub Room'),
    ('HOME', '11 to 4', 'VICTOR', 'Day Centre', 'HOME')
) as v(client_name, time_slot, instructors, service, area);

-- Correct Wed 8 Day Centre rota (Emanuel + Fadi; Ikram handled in prior step).
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, 'Wednesday', v.time_slot, v.instructors, v.service, v.area, 'SwimFarm', '2026-07-08'::date, 'active', a.id, a.id
from _portal_actor a
cross join (
  values
    ('Emanuel', '11 to 3', 'VICTOR', 'Day Centre', 'Hub Room'),
    ('Emanuel', '3 to 4', 'RAUL', 'Day Centre', 'Hub Room'),
    ('Fadi', '12.30 to 3', 'RAUL', 'Day Centre', 'Hub Room')
) as v(client_name, time_slot, instructors, service, area);

commit;

select client_name, time_slot, instructors, status
from public.portal_roster_rows
where session_date = '2026-07-08'::date
  and lower(trim(client_name)) in ('ikram', 'emanuel', 'fadi', 'home')
order by status desc, client_name, time_slot, instructors;
