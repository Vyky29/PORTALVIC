-- Monday 2026-06-29 · SwimFarm · Roberto · ACAT 11–12 should be Aquatic Activity, not Day Centre
-- The shipped bundle (roster_term_master.json) already has ACAT 11–12 on 29 Jun as
-- "Aquatic Activity / Big Pool", matching Roberto's submitted feedback
-- (service "Aquatic Activity", session_key 2026-06-29|11:00|acat).
-- BUT the live roster source the portal actually renders is portal_madre_document
-- (PORTAL_MADRE_LIVE) which is stale and still carries the Monday "Day Centre / Hub Room"
-- template for ACAT. So Session Overview builds time-less Day-Centre keys for the slot,
-- the time-based aquatic feedback never matches, and the row stays "Awaiting feedback".
-- Fix (this date only): overlay a dated portal_roster_rows entry so the 29 Jun ACAT slot
-- renders as Aquatic Activity. A dated overlay row with the same client+time replaces the
-- live MADRE base row, so the aquatic feedback binds 1:1 and shows "Feedback submitted".
-- Run: npx supabase db query --linked -f database/local-vault/step-2026-06-29-acat-aquatic.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

-- Idempotent re-run: retire any earlier live edits for this exact block.
update public.portal_roster_rows
set status = 'cancelled', updated_at = now(), updated_by = (select id from _portal_actor)
where session_date = '2026-06-29'::date
  and lower(trim(client_name)) = 'acat'
  and status = 'active'
  and exists (select 1 from _portal_actor);

-- Active Aquatic Activity row for 29 Jun (replaces the stale Day Centre MADRE slot).
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select 'ACAT', 'Monday', '11 to 12', 'ROBERTO', 'Aquatic Activity', 'Big Pool', 'SwimFarm',
       '2026-06-29'::date, 'active', a.id, a.id
from _portal_actor a;

commit;

select client_name, time_slot, instructors, service, area, venue, status
from public.portal_roster_rows
where session_date = '2026-06-29'::date
  and lower(trim(client_name)) = 'acat'
order by status desc, time_slot;
