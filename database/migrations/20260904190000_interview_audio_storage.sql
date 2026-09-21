-- Interview recordings: keep audio out of onboarding_candidates JSON (payload too large on iPad).

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'interview-audio',
  'interview-audio',
  false,
  26214400,
  array[
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/aac'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists interview_audio_storage_select on storage.objects;
create policy interview_audio_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'interview-audio'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  );

drop policy if exists interview_audio_storage_insert on storage.objects;
create policy interview_audio_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'interview-audio'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  );

drop policy if exists interview_audio_storage_update on storage.objects;
create policy interview_audio_storage_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'interview-audio'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  )
  with check (
    bucket_id = 'interview-audio'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  );

drop policy if exists interview_audio_storage_delete on storage.objects;
create policy interview_audio_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'interview-audio'
    and (
      public.portal_staff_profile_is_admin_or_ceo()
      or public.portal_staff_is_staff_or_lead()
    )
  );

commit;
