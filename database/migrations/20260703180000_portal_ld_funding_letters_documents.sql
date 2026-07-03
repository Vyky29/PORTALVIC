-- L&D funding Phase 3: decision letter document tracking + admin upload to My Documents.

begin;

alter table public.portal_staff_ld_funding_applications
  add column if not exists letter_document_id uuid references public.documents (id) on delete set null,
  add column if not exists letter_generated_at timestamptz;

comment on column public.portal_staff_ld_funding_applications.letter_document_id is
  'documents row when decision letter PDF saved to applicant My Documents (training).';

-- Staff cannot self-insert L&D decision letters (admin only).
drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own
on public.documents
for insert
to authenticated
with check (
  user_id = auth.uid()
  and lower(category) <> 'payslips'
  and lower(document_type) <> 'ld_funding_letter'
);

-- Admin may insert L&D decision letter for any worker.
drop policy if exists documents_insert_admin_ld_funding on public.documents;
create policy documents_insert_admin_ld_funding
on public.documents
for insert
to authenticated
with check (
  public.portal_staff_profile_is_portal_admin()
  and lower(document_type) = 'ld_funding_letter'
  and lower(category) = 'training'
  and source_page = 'ld-funding'
);

-- Admin upload into worker folder: {staff_uuid}/training/{filename}.pdf
drop policy if exists documents_storage_insert_admin_ld_funding on storage.objects;
create policy documents_storage_insert_admin_ld_funding
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and public.portal_staff_profile_is_portal_admin()
  and (storage.foldername(name))[2] = 'training'
);

commit;
