-- Give Michelle a portal login (Swimming instructor, SwimFarm).
-- Run on Portal Supabase (cklpnwhlqsulpmkipmqb) in SQL Editor.
--
-- Prereq: the Auth user stf021@staff.import.pending must already exist.
-- Create it first by running database/provision_staff_auth_users.py
-- (default password 990099 — set PORTAL_STAFF_ONLY_EMAIL=stf021@staff.import.pending
--  to only touch Michelle's account). If you want a shorter password, lower
-- "Minimum password length" in Authentication → Providers → Email first.
--
-- staff_profiles.id must equal auth.users.id; this upsert joins on the email.

begin;

with auth_row as (
  select au.id
  from auth.users au
  where lower(au.email) = lower('stf021@staff.import.pending')
  limit 1
)
insert into public.staff_profiles (
  id,
  full_name,
  username,
  app_role,
  staff_role,
  dashboard_route,
  is_active
)
select
  auth_row.id,
  'Michelle',
  'Michelle',
  'staff',
  'swimming',
  'staff_dashboard.html',
  true
from auth_row
on conflict (id) do update
set
  full_name = excluded.full_name,
  username = excluded.username,
  app_role = excluded.app_role,
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route,
  is_active = true;

commit;

-- Check (expect profile_ok = true, is_active = true):
select
  au.email,
  sp.username,
  sp.app_role,
  sp.dashboard_route,
  sp.is_active,
  (sp.id is not null) as profile_ok
from auth.users au
left join public.staff_profiles sp on sp.id = au.id
where lower(au.email) = lower('stf021@staff.import.pending');
