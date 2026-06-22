-- HR admin: read signed employment contract PDFs for staff profiles.

begin;

drop policy if exists documents_select_admin_employment_contracts on public.documents;
create policy documents_select_admin_employment_contracts
on public.documents
for select
to authenticated
using (
  public.portal_staff_profile_is_admin_or_ceo()
  and lower(document_type) = 'employment_contract'
);

drop policy if exists documents_storage_select_admin_employment_contracts on storage.objects;
create policy documents_storage_select_admin_employment_contracts
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and public.portal_staff_profile_is_admin_or_ceo()
  and (storage.foldername(name))[2] = 'contract_sign'
);

commit;
