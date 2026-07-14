-- Phase 2: Training Records expiry + admin external certificate documents.

begin;

alter table public.portal_training_records
  add column if not exists expires_on date;

comment on column public.portal_training_records.expires_on is
  'Optional expiry date for the competence / certificate associated with this record.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'portal_training_records_document_id_fkey'
  ) then
    alter table public.portal_training_records
      add constraint portal_training_records_document_id_fkey
      foreign key (document_id) references public.documents (id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'portal_training_record_participants_document_id_fkey'
  ) then
    alter table public.portal_training_record_participants
      add constraint portal_training_record_participants_document_id_fkey
      foreign key (document_id) references public.documents (id) on delete set null;
  end if;
end $$;

drop policy if exists documents_insert_admin_training_external on public.documents;
create policy documents_insert_admin_training_external
on public.documents
for insert
to authenticated
with check (
  public.portal_staff_profile_is_portal_admin()
  and lower(document_type) = 'training_external_certificate'
  and lower(category) = 'training'
  and source_page = 'admin-training-records'
);

drop policy if exists documents_select_admin_training_external on public.documents;
create policy documents_select_admin_training_external
on public.documents
for select
to authenticated
using (
  public.portal_staff_profile_is_portal_admin()
  and lower(document_type) in ('training_external_certificate', 'training_attendance_record')
);

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

drop policy if exists documents_storage_select_admin_ld_funding on storage.objects;
create policy documents_storage_select_admin_ld_funding
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and public.portal_staff_profile_is_portal_admin()
  and (storage.foldername(name))[2] = 'training'
);

commit;
