-- Admin may attach worker files (certificates, passport, checklist, first aid, etc.)
-- into My Documents — same pattern as payslips, but not limited to payslips.

begin;

drop policy if exists documents_insert_admin_worker_files on public.documents;
create policy documents_insert_admin_worker_files
on public.documents
for insert
to authenticated
with check (
  public.portal_staff_profile_is_portal_admin()
  and source_page = 'admin_documents'
  and lower(category) in ('documents', 'training')
  and lower(document_type) in (
    'certificate',
    'passport',
    'checklist',
    'firstaid',
    'safeguarding',
    'other',
    'training_external_certificate'
  )
  and lower(category) <> 'payslips'
);

drop policy if exists documents_select_admin_worker_files on public.documents;
create policy documents_select_admin_worker_files
on public.documents
for select
to authenticated
using (
  public.portal_staff_profile_is_portal_admin()
  and source_page = 'admin_documents'
);

-- Storage: {staff_uuid}/admin_documents/{type}/{filename}
drop policy if exists documents_storage_insert_admin_worker_files on storage.objects;
create policy documents_storage_insert_admin_worker_files
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and public.portal_staff_profile_is_portal_admin()
  and (storage.foldername(name))[2] = 'admin_documents'
);

drop policy if exists documents_storage_select_admin_worker_files on storage.objects;
create policy documents_storage_select_admin_worker_files
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and public.portal_staff_profile_is_portal_admin()
  and (storage.foldername(name))[2] = 'admin_documents'
);

commit;
