-- Set password for Berta's Auth user (run once in Supabase SQL Editor, Portal project).
-- Use when Dashboard reset / provision script fails but the user row already exists.
-- User id from Authentication → Users (b.traperocasado@gmail.com).

create extension if not exists pgcrypto;

update auth.users
set
  encrypted_password = crypt('121212', gen_salt('bf')),
  updated_at = now()
where id = '98e2738b-07a0-4cd2-8b7a-a9487d64a292'
  and lower(email) = lower('b.traperocasado@gmail.com');

-- Optional: same for John if needed (replace id after looking up in Dashboard)
-- update auth.users set encrypted_password = crypt('121212', gen_salt('bf')), updated_at = now()
-- where lower(email) = lower('johnnyosti37@gmail.com');
