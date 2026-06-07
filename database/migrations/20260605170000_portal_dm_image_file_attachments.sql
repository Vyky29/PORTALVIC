-- Chat attachments: photos and documents in 1:1 DM + CEO/group threads.
-- Reuses audio_storage_path / audio_mime columns (generic file path + mime).

begin;

alter table public.portal_staff_dm_messages
  drop constraint if exists portal_staff_dm_messages_type_check;

alter table public.portal_staff_dm_messages
  drop constraint if exists portal_staff_dm_messages_content_check;

alter table public.portal_staff_dm_messages
  add constraint portal_staff_dm_messages_type_check
  check (message_type in ('text', 'voice', 'image', 'file'));

alter table public.portal_staff_dm_messages
  add constraint portal_staff_dm_messages_content_check
  check (
    (
      message_type = 'text'
      and body is not null
      and char_length(trim(body)) > 0
      and audio_storage_path is null
    )
    or (
      message_type = 'voice'
      and audio_storage_path is not null
      and char_length(trim(audio_storage_path)) > 0
      and char_length(audio_storage_path) <= 512
    )
    or (
      message_type in ('image', 'file')
      and audio_storage_path is not null
      and char_length(trim(audio_storage_path)) > 0
      and char_length(audio_storage_path) <= 512
    )
  );

alter table public.portal_ceo_group_message
  drop constraint if exists portal_ceo_group_message_type_check;

alter table public.portal_ceo_group_message
  drop constraint if exists portal_ceo_group_message_content_check;

alter table public.portal_ceo_group_message
  add constraint portal_ceo_group_message_type_check
  check (message_type in ('text', 'voice', 'image', 'file'));

alter table public.portal_ceo_group_message
  add constraint portal_ceo_group_message_content_check
  check (
    (
      message_type = 'text'
      and body is not null
      and char_length(trim(body)) > 0
      and audio_storage_path is null
    )
    or (
      message_type = 'voice'
      and audio_storage_path is not null
      and char_length(trim(audio_storage_path)) > 0
      and char_length(audio_storage_path) <= 512
    )
    or (
      message_type in ('image', 'file')
      and audio_storage_path is not null
      and char_length(trim(audio_storage_path)) > 0
      and char_length(audio_storage_path) <= 512
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-dm-media',
  'portal-dm-media',
  false,
  15728640,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists portal_dm_media_select on storage.objects;
create policy portal_dm_media_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'portal-dm-media'
    and (
      (
        (storage.foldername(name))[1] = 'thread'
        and public.portal_staff_dm_user_in_thread(((storage.foldername(name))[2])::uuid)
      )
      or (
        (storage.foldername(name))[1] = 'group'
        and (
          public.portal_staff_profile_is_admin_or_ceo()
          or exists (
            select 1
            from public.staff_profiles sp
            where sp.id = (select auth.uid())
              and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) in ('staff', 'lead')
              and coalesce(sp.is_active, true)
          )
        )
      )
    )
  );

drop policy if exists portal_dm_media_insert on storage.objects;
create policy portal_dm_media_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'portal-dm-media'
    and (
      (
        (storage.foldername(name))[1] = 'thread'
        and public.portal_staff_dm_user_in_thread(((storage.foldername(name))[2])::uuid)
      )
      or (
        (storage.foldername(name))[1] = 'group'
        and (
          public.portal_staff_profile_is_admin_or_ceo()
          or exists (
            select 1
            from public.staff_profiles sp
            where sp.id = (select auth.uid())
              and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) in ('staff', 'lead')
              and coalesce(sp.is_active, true)
          )
        )
      )
    )
  );

comment on column public.portal_staff_dm_messages.message_type is 'text | voice | image | file';

commit;
