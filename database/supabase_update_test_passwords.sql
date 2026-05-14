-- Set the same test password for every portal staff Auth user
-- (emails stf001…stf019 except removed stf016, plus stf020 Demo).
--
-- Password: 990099 (6+ chars — Supabase Email auth often enforces minimum length 6; "99" alone is rejected.)
--
-- IMPORTANT (Supabase hosted): prefer the Admin API script — it is what GoTrue expects:
--   database/provision_staff_auth_users.py
-- with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (default password 990099 unless PORTAL_STAFF_BOOTSTRAP_PASSWORD is set).
-- Raw UPDATE auth.users + crypt() below can leave passwords incompatible with GoTrue on some
-- projects; if nobody can log in after running this SQL, run the Python script instead.
--
-- This SQL file is for projects that already have all auth users and only need a hash reset.
-- Requires extension pgcrypto. If crypt() fails or login still breaks, use the Python script instead.
--
-- If your Auth "minimum password length" is > 6, raise this string length or lower the provider setting.

update auth.users
set
  encrypted_password = crypt('990099', gen_salt('bf')),
  updated_at = now()
where email in (
  'stf001@staff.import.pending',
  'stf002@staff.import.pending',
  'stf003@staff.import.pending',
  'stf004@staff.import.pending',
  'stf005@staff.import.pending',
  'stf006@staff.import.pending',
  'stf007@staff.import.pending',
  'stf008@staff.import.pending',
  'stf009@staff.import.pending',
  'stf010@staff.import.pending',
  'stf011@staff.import.pending',
  'stf012@staff.import.pending',
  'stf013@staff.import.pending',
  'stf014@staff.import.pending',
  'stf015@staff.import.pending',
  'stf017@staff.import.pending',
  'stf018@staff.import.pending',
  'stf019@staff.import.pending',
  'stf020@staff.import.pending'
);
