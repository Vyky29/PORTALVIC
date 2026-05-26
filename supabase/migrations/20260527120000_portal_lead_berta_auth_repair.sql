-- Repair Berta (and John) Auth login without deleting users from the Dashboard.
-- Run in Supabase SQL Editor → Portal project (cklpnwhlqsulpmkipmqb).
--
-- Why Dashboard delete fails: many tables reference auth.users with ON DELETE RESTRICT
-- (reports, expenses, announcements, …). Deleting is unnecessary — rename email in place.
--
-- After this SQL: set password in Dashboard (user row → Send password recovery / set password)
--   OR: python database/set_portal_lead_password.py
--       (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; uses ?filter=email, not full user list)

begin;

-- -----------------------------------------------------------------------------
-- 0) Diagnose — run alone first if unsure
-- -----------------------------------------------------------------------------
-- select
--   au.id,
--   au.email,
--   au.email_confirmed_at is not null as email_confirmed,
--   sp.username,
--   sp.app_role,
--   sp.dashboard_route,
--   (select count(*) from auth.identities i where i.user_id = au.id) as identity_count
-- from auth.users au
-- left join public.staff_profiles sp on sp.id = au.id
-- where lower(au.email) in (
--   lower('stf006@staff.import.pending'),
--   lower('stf012@staff.import.pending'),
--   lower('johnnyosti37@gmail.com'),
--   lower('b.traperocasado@gmail.com')
-- )
-- order by au.email;

-- -----------------------------------------------------------------------------
-- 1) Remove orphan duplicate Auth rows (Gmail created manually, no staff_profiles)
-- -----------------------------------------------------------------------------
delete from auth.users corp
where lower(corp.email) = lower('johnnyosti37@gmail.com')
  and not exists (select 1 from public.staff_profiles sp where sp.id = corp.id)
  and exists (
    select 1 from auth.users ph
    where lower(ph.email) = lower('stf006@staff.import.pending')
  );

delete from auth.users corp
where lower(corp.email) = lower('b.traperocasado@gmail.com')
  and not exists (select 1 from public.staff_profiles sp where sp.id = corp.id)
  and exists (
    select 1 from auth.users ph
    where lower(ph.email) = lower('stf012@staff.import.pending')
  );

-- -----------------------------------------------------------------------------
-- 2) Rename placeholder → personal Gmail (auth.users)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 3) Sync auth.identities (required for email+password sign-in after SQL rename)
-- -----------------------------------------------------------------------------
update auth.identities i
set
  provider_id = u.email,
  identity_data = jsonb_set(
    coalesce(i.identity_data, '{}'::jsonb),
    '{email}',
    to_jsonb(u.email::text),
    true
  ),
  updated_at = now()
from auth.users u
where i.user_id = u.id
  and i.provider = 'email'
  and lower(u.email) in (
    lower('johnnyosti37@gmail.com'),
    lower('b.traperocasado@gmail.com')
  );

-- -----------------------------------------------------------------------------
-- 4) staff_profiles (lead dashboard)
-- -----------------------------------------------------------------------------
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

-- If step 2 did not change any row (email still stf012@…): a duplicate Gmail user may
-- already own the address — run the diagnose query and delete only the row WITHOUT
-- staff_profiles (Dashboard or the DELETE blocks in section 1).
