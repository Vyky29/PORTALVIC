-- Interview CVs: document or photo in Storage (not inside onboarding_candidates JSON).

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'interview-cvs',
  'interview-cvs',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists interview_cvs_storage_select on storage.objects;
create policy interview_cvs_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'interview-cvs'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  );

drop policy if exists interview_cvs_storage_insert on storage.objects;
create policy interview_cvs_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'interview-cvs'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  );

drop policy if exists interview_cvs_storage_update on storage.objects;
create policy interview_cvs_storage_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'interview-cvs'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  )
  with check (
    bucket_id = 'interview-cvs'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  );

drop policy if exists interview_cvs_storage_delete on storage.objects;
create policy interview_cvs_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'interview-cvs'
    and (
      public.portal_staff_profile_is_admin_or_ceo()
      or public.portal_staff_is_staff_or_lead()
    )
  );

commit;
