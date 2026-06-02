-- Payslips: admin uploads PDFs into each worker's documents folder; staff read via My Documents.

begin;

-- Staff cannot self-upload payslip rows (admin only).
drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own
on public.documents
for insert
to authenticated
with check (
  user_id = auth.uid()
  and lower(category) <> 'payslips'
);

-- Admin/CEO may insert payslip metadata for any worker.
drop policy if exists documents_insert_admin_payslips on public.documents;
create policy documents_insert_admin_payslips
on public.documents
for insert
to authenticated
with check (
  public.portal_staff_profile_is_portal_admin()
  and lower(category) = 'payslips'
  and lower(document_type) = 'payslip'
  and source_page = 'payslips'
);

-- Admin/CEO may list payslips (upload UI / audit).
drop policy if exists documents_select_admin_payslips on public.documents;
create policy documents_select_admin_payslips
on public.documents
for select
to authenticated
using (
  public.portal_staff_profile_is_portal_admin()
  and lower(category) = 'payslips'
);

-- Admin upload into worker folder: {staff_uuid}/payslips/{filename}.pdf
drop policy if exists documents_storage_insert_admin_payslips on storage.objects;
create policy documents_storage_insert_admin_payslips
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and public.portal_staff_profile_is_portal_admin()
  and (storage.foldername(name))[2] = 'payslips'
);

commit;
