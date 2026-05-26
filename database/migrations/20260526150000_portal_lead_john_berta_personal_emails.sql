-- Programme leads John & Berta: link personal Gmail to existing placeholder Auth accounts.
-- Run in Supabase SQL Editor (Portal project cklpnwhlqsulpmkipmqb).
-- After this: set passwords via Dashboard or:
--   $env:PORTAL_STAFF_BOOTSTRAP_PASSWORD="121212"
--   $env:PORTAL_STAFF_ONLY_EMAIL="johnnyosti37@gmail.com,b.traperocasado@gmail.com"
--   python database/provision_staff_auth_users.py

begin;

-- -----------------------------------------------------------------------------
-- 0) Diagnose (optional)
-- -----------------------------------------------------------------------------
-- select au.id, au.email, sp.username, sp.app_role, sp.email_personal
-- from auth.users au
-- left join public.staff_profiles sp on sp.id = au.id
-- where lower(au.email) in (
--   lower('stf006@staff.import.pending'),
--   lower('stf012@staff.import.pending'),
--   lower('johnnyosti37@gmail.com'),
--   lower('b.traperocasado@gmail.com')
-- );

-- -----------------------------------------------------------------------------
-- 1) JOHN — stf006 → johnnyosti37@gmail.com
-- -----------------------------------------------------------------------------
delete from auth.users corp
where lower(corp.email) = lower('johnnyosti37@gmail.com')
  and not exists (select 1 from public.staff_profiles sp where sp.id = corp.id)
  and exists (
    select 1 from auth.users ph
    where lower(ph.email) = lower('stf006@staff.import.pending')
  );

update auth.users
set
  email = 'johnnyosti37@gmail.com',
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where lower(email) = lower('stf006@staff.import.pending')
  and not exists (
    select 1 from auth.users o
    where lower(o.email) = lower('johnnyosti37@gmail.com')
      and o.id <> auth.users.id
  );

insert into public.staff_profiles (
  id, username, full_name, app_role, staff_role, dashboard_route, is_active, email_personal
)
select
  au.id,
  'John',
  'John Kyei-Fram',
  'lead',
  'support',
  'lead_dashboard.html',
  true,
  'johnnyosti37@gmail.com'
from auth.users au
where lower(au.email) = lower('johnnyosti37@gmail.com')
on conflict (id) do update
set
  username = excluded.username,
  full_name = excluded.full_name,
  app_role = 'lead',
  staff_role = excluded.staff_role,
  dashboard_route = 'lead_dashboard.html',
  is_active = true,
  email_personal = excluded.email_personal;

-- -----------------------------------------------------------------------------
-- 2) BERTA — stf012 → b.traperocasado@gmail.com
-- -----------------------------------------------------------------------------
delete from auth.users corp
where lower(corp.email) = lower('b.traperocasado@gmail.com')
  and not exists (select 1 from public.staff_profiles sp where sp.id = corp.id)
  and exists (
    select 1 from auth.users ph
    where lower(ph.email) = lower('stf012@staff.import.pending')
  );

update auth.users
set
  email = 'b.traperocasado@gmail.com',
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where lower(email) = lower('stf012@staff.import.pending')
  and not exists (
    select 1 from auth.users o
    where lower(o.email) = lower('b.traperocasado@gmail.com')
      and o.id <> auth.users.id
  );

insert into public.staff_profiles (
  id, username, full_name, app_role, staff_role, dashboard_route, is_active, email_personal
)
select
  au.id,
  'Berta',
  'Berta Trapero Casado',
  'lead',
  'support',
  'lead_dashboard.html',
  true,
  'b.traperocasado@gmail.com'
from auth.users au
where lower(au.email) = lower('b.traperocasado@gmail.com')
on conflict (id) do update
set
  username = excluded.username,
  full_name = excluded.full_name,
  app_role = 'lead',
  staff_role = excluded.staff_role,
  dashboard_route = 'lead_dashboard.html',
  is_active = true,
  email_personal = excluded.email_personal;

commit;

-- Permissions already in place for app_role = 'lead':
--   session_feedback_select_lead_all (read all session_feedback)
--   lead_session_reports_select_programme_leads
-- UI: lead_dashboard.html + portal-lead-session-overview.html (scoped in portal_lead_session_scope.js)
