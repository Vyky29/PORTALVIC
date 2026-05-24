-- Portal: corporate admin/CEO login emails (run in Supabase SQL Editor — project Portal cklpnwhlqsulpmkipmqb)
--
-- Sign-in uses auth.users.email. The browser maps victor@clubsensational.org etc. in auth-map.js;
-- each address must exist in Authentication with the password you set there.
--
-- Placeholder staff emails (stf013@…) still work until you switch the Auth user email below.

-- -----------------------------------------------------------------------------
-- A) Status: corporate email vs placeholder vs profile link
-- -----------------------------------------------------------------------------
select
  e.corporate_email,
  e.label,
  e.placeholder_email,
  exists (
    select 1 from auth.users au where lower(au.email) = lower(e.corporate_email)
  ) as auth_corporate_ok,
  exists (
    select 1 from auth.users au where lower(au.email) = lower(e.placeholder_email)
  ) as auth_placeholder_ok,
  exists (
    select 1
    from auth.users au
    join public.staff_profiles sp on sp.id = au.id
    where lower(au.email) = lower(e.corporate_email)
  ) as profile_corporate_ok,
  exists (
    select 1
    from auth.users au
    join public.staff_profiles sp on sp.id = au.id
    where lower(au.email) = lower(e.placeholder_email)
  ) as profile_placeholder_ok
from (
  values
    ('victor@clubsensational.org', 'Victor', 'stf013@staff.import.pending'),
    ('raul@clubsensational.org', 'Raul', 'stf018@staff.import.pending'),
    ('javier@clubsensational.org', 'Javi (CEO)', 'stf017@staff.import.pending'),
    ('sevitha@clubsensational.org', 'Sevitha', 'stf019@staff.import.pending')
) as e(corporate_email, label, placeholder_email)
order by e.label;

-- -----------------------------------------------------------------------------
-- B) Optional: point existing placeholder Auth users at corporate email
--     Run ONE row at a time after checking A (no duplicate corporate_email).
--     Then sign in on login.html with the corporate address + your Supabase password.
-- -----------------------------------------------------------------------------
-- update auth.users
-- set email = 'victor@clubsensational.org', email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
-- where lower(email) = lower('stf013@staff.import.pending');

-- update auth.users
-- set email = 'raul@clubsensational.org', email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
-- where lower(email) = lower('stf018@staff.import.pending');

-- update auth.users
-- set email = 'javier@clubsensational.org', email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
-- where lower(email) = lower('stf017@staff.import.pending');

-- update auth.users
-- set email = 'sevitha@clubsensational.org', email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
-- where lower(email) = lower('stf019@staff.import.pending');

-- -----------------------------------------------------------------------------
-- C) Re-run block A — auth_corporate_ok and profile_corporate_ok should be true.
-- -----------------------------------------------------------------------------
