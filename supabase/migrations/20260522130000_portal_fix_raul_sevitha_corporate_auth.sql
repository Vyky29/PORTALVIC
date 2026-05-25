-- Fix corporate login rows from 20260522120000 block A screenshot:
--   Victor / Javi — OK (all true)
--   Raul — auth_corporate_ok true, profile_corporate_ok FALSE (profile on stf018 only)
--   Sevitha — all false (no Auth users yet)
--
-- Run in Supabase SQL Editor (Portal). Execute sections in order.

-- =============================================================================
-- 0) Diagnose: auth user ids + staff_profiles for Raul / Sevitha
-- =============================================================================
select
  au.id,
  au.email,
  sp.username,
  sp.app_role,
  sp.staff_role,
  sp.is_active
from auth.users au
left join public.staff_profiles sp on sp.id = au.id
where lower(au.email) in (
  lower('raul@clubsensational.org'),
  lower('stf018@staff.import.pending'),
  lower('sevitha@clubsensational.org'),
  lower('stf019@staff.import.pending')
)
order by au.email;

-- =============================================================================
-- 1) RAÚL — one Auth user with raul@clubsensational.org + linked staff_profiles
--
-- Case A (usual from your screenshot): corporate Auth exists WITHOUT profile;
-- placeholder stf018 HAS profile. Remove orphan corporate user, rename placeholder.
-- =============================================================================

-- 1a) Remove duplicate corporate Auth user that has no staff_profiles row
delete from auth.users corp
where lower(corp.email) = lower('raul@clubsensational.org')
  and not exists (
    select 1 from public.staff_profiles sp where sp.id = corp.id
  )
  and exists (
    select 1 from auth.users ph
    where lower(ph.email) = lower('stf018@staff.import.pending')
  );

-- 1b) Point the placeholder account (the one with staff_profiles) at the corporate email
update auth.users
set
  email = 'raul@clubsensational.org',
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where lower(email) = lower('stf018@staff.import.pending');

-- 1c) Ensure staff_profiles roles for that id
insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Raul', 'Raul', 'ceo', 'manager', 'ceo_dashboard.html', true
from auth.users au
where lower(au.email) = lower('raul@clubsensational.org')
on conflict (id) do update
set
  full_name = excluded.full_name,
  username = excluded.username,
  app_role = excluded.app_role,
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route,
  is_active = excluded.is_active;

-- =============================================================================
-- 2) SEVITHA — create Auth users first (SQL cannot create Auth passwords)
--
-- PowerShell (service_role from Dashboard → Settings → API):
--
--   $env:SUPABASE_URL="https://cklpnwhlqsulpmkipmqb.supabase.co"
--   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."
--   $env:PORTAL_STAFF_BOOTSTRAP_PASSWORD="990099"
--   $env:PORTAL_STAFF_ONLY_EMAIL="stf019@staff.import.pending"
--   python database\provision_staff_auth_users.py
--
-- Or create user in Dashboard → Authentication with email sevitha@clubsensational.org
-- and the password you use in production, then run 2b–2c only.
-- =============================================================================

-- 2b) After Auth exists on stf019@ OR sevitha@ — staff_profiles
insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Sevitha', 'Sevitha', 'admin', 'admin', 'admin_dashboard.html', true
from auth.users au
where lower(au.email) in (
  lower('stf019@staff.import.pending'),
  lower('sevitha@clubsensational.org')
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  username = excluded.username,
  app_role = excluded.app_role,
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route,
  is_active = excluded.is_active;

-- 2c) Prefer corporate email (run after 2b if you started with stf019@)
update auth.users
set
  email = 'sevitha@clubsensational.org',
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where lower(email) = lower('stf019@staff.import.pending')
  and not exists (
    select 1 from auth.users o
    where lower(o.email) = lower('sevitha@clubsensational.org')
      and o.id <> auth.users.id
  );

-- Optional: bootstrap password 990099 on Sevitha placeholder (pgcrypto extension required)
-- update auth.users
-- set encrypted_password = crypt('990099', gen_salt('bf')), updated_at = now()
-- where lower(email) in (lower('stf019@staff.import.pending'), lower('sevitha@clubsensational.org'));

-- =============================================================================
-- 3) Re-run status check (same as migration 20260522120000 block A) — all four cols true
-- =============================================================================
select
  e.corporate_email,
  e.label,
  exists (
    select 1 from auth.users au where lower(au.email) = lower(e.corporate_email)
  ) as auth_corporate_ok,
  exists (
    select 1
    from auth.users au
    join public.staff_profiles sp on sp.id = au.id
    where lower(au.email) = lower(e.corporate_email)
  ) as profile_corporate_ok
from (
  values
    ('victor@clubsensational.org', 'Victor'),
    ('raul@clubsensational.org', 'Raul'),
    ('javier@clubsensational.org', 'Javi'),
    ('sevitha@clubsensational.org', 'Sevitha')
) as e(corporate_email, label)
order by e.label;
