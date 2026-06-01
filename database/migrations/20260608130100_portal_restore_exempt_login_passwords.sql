-- Ensure exempt accounts keep email + 6-digit passwords (not staff PIN roster).
-- Run after 20260608130000_portal_sync_staff_pin_passwords.sql if needed.

begin;

create extension if not exists pgcrypto;

update auth.users
set encrypted_password = crypt('121212', gen_salt('bf')), updated_at = now()
where lower(email) in (
  lower('victor@clubsensational.org'),
  lower('raul@clubsensational.org'),
  lower('javier@clubsensational.org'),
  lower('b.traperocasado@gmail.com'),
  lower('johnnyosti37@gmail.com'),
  lower('sevitha802@gmail.com')
);

update auth.users
set encrypted_password = crypt('555555', gen_salt('bf')), updated_at = now()
where lower(email) = lower('michelle@youtimecounselling.com');

commit;
