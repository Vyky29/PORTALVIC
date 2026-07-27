-- Admin/CEO: read staff policy acknowledgments for the Policy sign-offs matrix.

begin;

drop policy if exists documents_select_admin_staff_policy_ack on public.documents;
create policy documents_select_admin_staff_policy_ack
on public.documents
for select
to authenticated
using (
  public.portal_staff_profile_is_admin_or_ceo()
  and lower(document_type) = 'staff_policy_ack'
);

commit;
