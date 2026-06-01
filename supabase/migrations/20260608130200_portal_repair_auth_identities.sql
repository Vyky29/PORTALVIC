-- Repair auth.identities for staff Auth users created via SQL (crypt password only).
-- Without an email identity row, signInWithPassword returns "Database error querying schema".
-- Safe to re-run: only inserts where identity count = 0.

begin;

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  au.id,
  au.id::text,
  jsonb_build_object(
    'sub', au.id::text,
    'email', au.email,
    'email_verified', false,
    'phone_verified', false
  ),
  'email',
  now(),
  coalesce(au.created_at, now()),
  now()
from auth.users au
inner join public.staff_profiles sp on sp.id = au.id and sp.is_active is distinct from false
where au.email is not null
  and not exists (
    select 1 from auth.identities i where i.user_id = au.id and i.provider = 'email'
  );

-- Verify (expect identity_count >= 1 for active staff)
select
  sp.username,
  au.email,
  (select count(*) from auth.identities i where i.user_id = au.id) as identity_count
from public.staff_profiles sp
inner join auth.users au on au.id = sp.id
where sp.is_active is distinct from false
order by sp.username;

commit;
