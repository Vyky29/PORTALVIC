-- Staff profile photos (topbar self-service upload → auth user_metadata.avatar_url).

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-avatars',
  'staff-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists portal_staff_avatars_insert on storage.objects;
create policy portal_staff_avatars_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'staff-avatars'
    and public.portal_staff_is_staff_or_lead()
  );

drop policy if exists portal_staff_avatars_update on storage.objects;
create policy portal_staff_avatars_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'staff-avatars'
    and public.portal_staff_is_staff_or_lead()
  )
  with check (
    bucket_id = 'staff-avatars'
    and public.portal_staff_is_staff_or_lead()
  );

drop policy if exists portal_staff_avatars_delete on storage.objects;
create policy portal_staff_avatars_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'staff-avatars'
    and public.portal_staff_is_staff_or_lead()
  );

commit;
