-- Fix auth.identities.provider_id: must be auth.users.id (UUID text), not the email address.
-- Wrong provider_id causes signInWithPassword → "Database error querying schema".

begin;

update auth.identities i
set
  provider_id = i.user_id::text,
  updated_at = now()
where i.provider = 'email'
  and i.provider_id is distinct from i.user_id::text;

commit;
