-- APPLY IN SUPABASE SQL EDITOR (Dashboard ? SQL ? New query ? Run)
-- Fixes: admin Policy sign-offs matrix cannot see staff_policy_ack rows (e.g. Raúl).

begin;

drop policy if exists documents_select_admin_staff_policy_ack on public.documents;
create policy documents_select_admin_staff_policy_ack
on public.documents
for select
to authenticated
using (
  (
    public.portal_staff_profile_is_admin_or_ceo()
    or public.portal_staff_profile_is_portal_admin()
  )
  and lower(document_type) = 'staff_policy_ack'
);

create or replace function public.portal_admin_list_staff_policy_acks()
returns table (
  user_id uuid,
  related_session_key text,
  created_at timestamptz,
  related_date date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.portal_staff_profile_is_admin_or_ceo()
    or public.portal_staff_profile_is_portal_admin()
  ) then
    raise exception 'not authorized';
  end if;

  return query
  select
    d.user_id,
    d.related_session_key,
    d.created_at,
    d.related_date
  from public.documents d
  where lower(d.document_type) = 'staff_policy_ack'
    and d.related_session_key is not null
    and btrim(d.related_session_key) <> '';
end;
$$;

revoke all on function public.portal_admin_list_staff_policy_acks() from public;
grant execute on function public.portal_admin_list_staff_policy_acks() to authenticated;

commit;

-- Optional check after Run:
-- select user_id, related_session_key, created_at
-- from public.documents
-- where document_type = 'staff_policy_ack'
-- order by created_at desc
-- limit 20;
