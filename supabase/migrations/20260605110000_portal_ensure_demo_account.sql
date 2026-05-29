-- Ensure the 'demo' test account exists for button testing (feedback / incident /
-- cancellation / venue). The demo account bypasses the "session must have ended"
-- gate, so every action button is testable at any time.
--
--   Login (login.html): username  demo   /  password  990099
--   (username maps to email stf020@staff.import.pending)
--
-- Idempotent: re-running resets the password and re-links the staff_profile.
-- pgcrypto (crypt/gen_salt) is already enabled in this project (see bootstrap).
begin;

-- 1) Create the auth user if it is missing.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  gen_random_uuid(), 'authenticated', 'authenticated',
  'stf020@staff.import.pending', crypt('990099', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, false, false
where not exists (
  select 1 from auth.users au where lower(au.email) = lower('stf020@staff.import.pending')
);

-- 2) Reset password + confirm email (covers the "already exists" case).
update auth.users
   set encrypted_password = crypt('990099', gen_salt('bf')),
       email_confirmed_at = coalesce(email_confirmed_at, now()),
       updated_at         = now()
 where lower(email) = lower('stf020@staff.import.pending');

-- 3) Drop any stale 'demo' profile pointing at a different (deleted/relinked) user.
delete from public.staff_profiles
 where username = 'demo'
   and id not in (
     select au.id from auth.users au
     where lower(au.email) = lower('stf020@staff.import.pending')
   );

-- 4) Link / refresh the staff profile for the demo user.
insert into public.staff_profiles
  (id, username, full_name, app_role, staff_role, dashboard_route, is_active)
select au.id, 'demo', 'Demo', 'staff', 'swimming', 'staff_dashboard.html', true
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
