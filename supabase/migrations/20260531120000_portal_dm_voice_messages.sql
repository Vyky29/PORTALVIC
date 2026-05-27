-- Internal DM / CEO group chat: voice messages + Storage bucket portal-dm-audio.
-- Run on Portal Supabase before using voice in admin / lead / CEO chat UIs.

begin;

-- Helper: caller is participant on a DM thread.
create or replace function public.portal_staff_dm_user_in_thread(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portal_staff_dm_threads t
    where t.id = tid
      and (t.participant_a = (select auth.uid()) or t.participant_b = (select auth.uid()))
  );
$$;

revoke all on function public.portal_staff_dm_user_in_thread(uuid) from public;
grant execute on function public.portal_staff_dm_user_in_thread(uuid) to authenticated;

-- 1:1 staff DM messages
alter table public.portal_staff_dm_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists audio_storage_path text,
  add column if not exists audio_mime text,
  add column if not exists duration_ms integer;

alter table public.portal_staff_dm_messages
  alter column body drop not null;

alter table public.portal_staff_dm_messages
  drop constraint if exists portal_staff_dm_messages_body_len;

alter table public.portal_staff_dm_messages
  drop constraint if exists portal_staff_dm_messages_type_check;

alter table public.portal_staff_dm_messages
  drop constraint if exists portal_staff_dm_messages_content_check;

alter table public.portal_staff_dm_messages
  add constraint portal_staff_dm_messages_type_check
  check (message_type in ('text', 'voice'));

alter table public.portal_staff_dm_messages
  add constraint portal_staff_dm_messages_body_len
  check (body is null or char_length(body) <= 8000);

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
  );

comment on column public.portal_staff_dm_messages.message_type is 'text | voice';
comment on column public.portal_staff_dm_messages.audio_storage_path is 'Storage object path in bucket portal-dm-audio';

-- CEO group messages (same shape)
alter table public.portal_ceo_group_message
  add column if not exists message_type text not null default 'text',
  add column if not exists audio_storage_path text,
  add column if not exists audio_mime text,
  add column if not exists duration_ms integer;

alter table public.portal_ceo_group_message
  alter column body drop not null;

alter table public.portal_ceo_group_message
  drop constraint if exists portal_ceo_group_message_type_check;

alter table public.portal_ceo_group_message
  drop constraint if exists portal_ceo_group_message_content_check;

alter table public.portal_ceo_group_message
  add constraint portal_ceo_group_message_type_check
  check (message_type in ('text', 'voice'));

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
  );

-- Storage bucket (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-dm-audio',
  'portal-dm-audio',
  false,
  8388608,
  array['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path: thread/{thread_uuid}/{message_uuid}.ext  OR  group/{group_uuid}/{message_uuid}.ext
drop policy if exists portal_dm_audio_select on storage.objects;
create policy portal_dm_audio_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'portal-dm-audio'
    and (
      (
        (storage.foldername(name))[1] = 'thread'
        and public.portal_staff_dm_user_in_thread(((storage.foldername(name))[2])::uuid)
      )
      or (
        (storage.foldername(name))[1] = 'group'
        and public.portal_staff_profile_is_admin_or_ceo()
      )
    )
  );

drop policy if exists portal_dm_audio_insert on storage.objects;
create policy portal_dm_audio_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'portal-dm-audio'
    and (
      (
        (storage.foldername(name))[1] = 'thread'
        and public.portal_staff_dm_user_in_thread(((storage.foldername(name))[2])::uuid)
      )
      or (
        (storage.foldername(name))[1] = 'group'
        and public.portal_staff_profile_is_admin_or_ceo()
      )
    )
  );

commit;
