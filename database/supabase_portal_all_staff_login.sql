-- =============================================================================
-- PORTAL: Enable login for ALL staff (not only Victor / Berta / Roberto)
-- =============================================================================
--
-- How login works in the browser:
--   1) User types first name (e.g. "Dan") in the login form.
--   2) database/auth-map.js maps that name → email (e.g. stf003@staff.import.pending).
--      Optional: upload staff_login_map.js (not .json — WordPress often blocks JSON) next to
--      auth-handler.js in Media; login page loads it before the module so names stay in sync.
--   3) Supabase Auth signInWithPassword(email, password) runs.
--   4) auth-handler.js loads public.staff_profiles where id = auth.users.id.
--
-- If the email does NOT exist in Supabase → Authentication → Users, login fails
-- for everyone except accounts you already created manually.
--
-- ----------------------------------------------------------------------------
-- WHAT YOU MUST DO (Supabase Dashboard)
-- ----------------------------------------------------------------------------
--
-- A) Easiest: on a secure machine set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and run:
--      python database/provision_staff_auth_users.py
--    That creates any missing stf*@staff.import.pending users and sets password 990099 (or PORTAL_STAFF_BOOTSTRAP_PASSWORD).
--    Ensure Authentication → Providers → Email → minimum password length allows the bootstrap password (default 990099 = 6 chars).
--
--    Manual alternative: Authentication → Users → Add user for EACH email below, then run
--    supabase_update_test_passwords.sql if you prefer SQL hash updates.
--
-- B) After users exist, run in SQL Editor (in order):
--      1. staff_profiles_seed.sql     — links auth.users.id → staff_profiles
--      2. supabase_staff_bootstrap.sql — optional route/role patch
--      3. supabase_update_test_passwords.sql — set shared test password
--
-- C) RLS: ensure supabase_staff_profiles_rls.sql policies allow SELECT own row.
--
-- ----------------------------------------------------------------------------
-- Emails to create (20 accounts; stf016 intentionally unused)
-- ----------------------------------------------------------------------------
--   stf001@staff.import.pending  Sandra
--   stf002@staff.import.pending  Roberto
--   stf003@staff.import.pending  Dan
--   stf004@staff.import.pending  Angel
--   stf005@staff.import.pending  Youssef / Yusef
--   stf006@staff.import.pending  John
--   stf007@staff.import.pending  Bismark
--   stf008@staff.import.pending  Giuseppe
--   stf009@staff.import.pending  Godsway
--   stf010@staff.import.pending  Javier
--   stf011@staff.import.pending  Aurora
--   stf012@staff.import.pending  Berta
--   stf013@staff.import.pending  Victor
--   stf014@staff.import.pending  Carlos
--   stf015@staff.import.pending  Alex
--   stf017@staff.import.pending  Javi
--   stf018@staff.import.pending  Raul
--   stf019@staff.import.pending  Sevitha
--   stf020@staff.import.pending  Demo (shared test roster; see staff_profiles username demo)
--
-- ----------------------------------------------------------------------------

-- Diagnostic: show which placeholder emails still have NO auth user
select x.email as missing_auth_user
from (
  values
    ('stf001@staff.import.pending'),
    ('stf002@staff.import.pending'),
    ('stf003@staff.import.pending'),
    ('stf004@staff.import.pending'),
    ('stf005@staff.import.pending'),
    ('stf006@staff.import.pending'),
    ('stf007@staff.import.pending'),
    ('stf008@staff.import.pending'),
    ('stf009@staff.import.pending'),
    ('stf010@staff.import.pending'),
    ('stf011@staff.import.pending'),
    ('stf012@staff.import.pending'),
    ('stf013@staff.import.pending'),
    ('stf014@staff.import.pending'),
    ('stf015@staff.import.pending'),
    ('stf017@staff.import.pending'),
    ('stf018@staff.import.pending'),
    ('stf019@staff.import.pending'),
    ('stf020@staff.import.pending')
) as x(email)
where not exists (
  select 1 from auth.users au where lower(au.email) = lower(x.email)
)
order by 1;

-- Optional: list auth users missing a staff_profiles row (after seed)
-- select au.email
-- from auth.users au
-- left join public.staff_profiles sp on sp.id = au.id
-- where au.email like 'stf%@staff.import.pending' and sp.id is null
-- order by au.email;
