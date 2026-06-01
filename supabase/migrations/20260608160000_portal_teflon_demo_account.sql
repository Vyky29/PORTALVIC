-- Replace legacy Demo (stf020) with Teflon — portal guide demo account.
-- Login: username Teflon / PIN 1111 (see portal_login_pins).
-- Idempotent: safe to re-run.
begin;

-- 1) Ensure auth user exists (reuse stf020@staff.import.pending slot).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  gen_random_uuid(), 'authenticated', 'authenticated',
  'stf020@staff.import.pending', crypt('1111', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, false, false
where not exists (
  select 1 from auth.users au where lower(au.email) = lower('stf020@staff.import.pending')
);

-- 2) Set PIN password + confirm email.
update auth.users
   set encrypted_password = crypt('1111', gen_salt('bf')),
       email_confirmed_at = coalesce(email_confirmed_at, now()),
       updated_at         = now()
 where lower(email) = lower('stf020@staff.import.pending');

-- 3) Remove stale demo/teflon profiles pointing at a different user id.
delete from public.staff_profiles
 where username in ('demo', 'teflon')
   and id not in (
     select au.id from auth.users au
     where lower(au.email) = lower('stf020@staff.import.pending')
   );

-- 4) Link staff profile for Teflon demo.
insert into public.staff_profiles
  (id, username, full_name, app_role, staff_role, dashboard_route, is_active)
select au.id, 'teflon', 'Teflon', 'staff', 'swimming', 'staff_dashboard.html', true
from auth.users au
where lower(au.email) = lower('stf020@staff.import.pending')
on conflict (id) do update
set username        = excluded.username,
    full_name       = excluded.full_name,
    app_role        = excluded.app_role,
    staff_role      = excluded.staff_role,
    dashboard_route = excluded.dashboard_route,
    is_active       = true;

commit;
