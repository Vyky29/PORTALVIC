-- Replace sevitha802@gmail.com with sevitha@clubsensational.org in executive password restore.

begin;
create extension if not exists pgcrypto;

update auth.users
set encrypted_password = crypt('121212', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where lower(email) in (
  lower('victor@clubsensational.org'),
  lower('raul@clubsensational.org'),
  lower('javier@clubsensational.org'),
  lower('sevitha@clubsensational.org')
);

commit;
