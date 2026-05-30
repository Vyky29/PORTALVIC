-- Manual helper (run by hand in Supabase SQL Editor, Portal project cklpnwhlqsulpmkipmqb).
-- Sets Michelle's Auth password to 555555 directly on auth.users, for the EXISTING
-- user michelle@youtimecounselling.com (the one Supabase said "already exists").
--
-- NOTE: This is NOT a deploy migration on purpose — never commit passwords into the
-- migration set. The normal/recommended way is Authentication -> Users -> Reset password.
-- Use this only if the UI is slower for you.
--
-- Requires pgcrypto (preinstalled on Supabase, in the "extensions" schema).
-- After this, run database/migrations/20260530090000_portal_add_michelle_staff_login.sql
-- to (re)link her staff_profiles row to this Auth user.

update auth.users
set
  encrypted_password = extensions.crypt('555555', extensions.gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where lower(email) = lower('michelle@youtimecounselling.com');

-- Expect 1 row updated. Verify the user exists and is confirmed:
select
  id,
  email,
  (email_confirmed_at is not null) as email_confirmed,
  updated_at
from auth.users
where lower(email) = lower('michelle@youtimecounselling.com');
