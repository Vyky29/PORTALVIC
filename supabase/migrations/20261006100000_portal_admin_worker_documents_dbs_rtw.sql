-- Admin attach for a worker: DBS and Right to work were missing from the
-- insert allow-list, so the row failed with
-- "new row violates row-level security policy for table documents".

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
    'dbs',
    'passport',
    'righttowork',
    'checklist',
    'firstaid',
    'safeguarding',
    'other',
    'training_external_certificate'
  )
  and lower(category) <> 'payslips'
);

commit;
