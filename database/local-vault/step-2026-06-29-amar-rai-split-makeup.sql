-- Monday 2026-06-29 · Northolt · Roberto · Amar Rai 5–6pm split for make-ups
-- Amar Rai's base roster slot is a single 60' block "5 to 6". Sevitha handed out
-- two 30' make-ups in that hour (Yunis 5–5.30, Gemma 5.30–6) via schedule_overrides.
-- Scheduling & Cover splits aquatic hours into 30' bands so both make-ups bind and
-- render correctly. Session Overview does NOT split the hour, so the half-hour
-- make-ups can't attach to the 60' base row → they fell out as orphan rows and
-- Amar Rai's hour stayed "awaiting feedback".
-- Fix (this date only): split Amar Rai's 60' base into two 30' rows via the live
-- portal_roster_rows overlay so each make-up override matches 1:1 in both views.
-- Run: npx supabase db query --linked -f database/local-vault/step-2026-06-29-amar-rai-split-makeup.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

-- Retire any earlier live edits for this exact block (idempotent re-run).
update public.portal_roster_rows
set status = 'cancelled', updated_at = now(), updated_by = (select id from _portal_actor)
where session_date = '2026-06-29'::date
  and lower(trim(client_name)) = 'amar ra'
  and status = 'active'
  and exists (select 1 from _portal_actor);

-- 1) Cancel the 60' bundle row "Amar Ra 5 to 6" (suppresses it from the overview).
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select 'Amar Ra', 'Monday', '5 to 6', 'ROBERTO', 'Aquatic Activity', 'Teaching Pool', 'Northolt',
       '2026-06-29'::date, 'cancelled', a.id, a.id
from _portal_actor a;

-- 2) Two 30' base rows so each make-up override (17:00 Yunis / 17:30 Gemma) binds 1:1.
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, 'Monday', v.time_slot, 'ROBERTO', 'Aquatic Activity', 'Teaching Pool', 'Northolt',
       '2026-06-29'::date, 'active', a.id, a.id
from _portal_actor a
cross join (values
  ('Amar Ra', '5 to 5.30'),
  ('Amar Ra', '5.30 to 6')
) as v(client_name, time_slot);

commit;

select client_name, time_slot, instructors, service, area, venue, status
from public.portal_roster_rows
where session_date = '2026-06-29'::date
  and lower(trim(client_name)) = 'amar ra'
order by status desc, time_slot;
