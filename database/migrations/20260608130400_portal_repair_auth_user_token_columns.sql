-- Align auth.users token columns with GoTrue-created rows (empty string, not NULL).
-- SQL-bootstrap users (2026-05-13 batch) had NULL tokens and failed signInWithPassword.

begin;

update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, ''),
  updated_at = now()
where id in (
  select sp.id
  from public.staff_profiles sp
  where sp.is_active is distinct from false
);

commit;
