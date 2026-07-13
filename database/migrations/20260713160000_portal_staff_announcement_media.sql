-- Staff announcements: multiple photo attachments (admin compose → staff view).

begin;

create table if not exists public.portal_staff_announcement_media (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  announcement_id uuid not null references public.portal_staff_announcements (id) on delete cascade,
  storage_path text not null,
  mime_type text,
  byte_size integer,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  constraint portal_staff_announcement_media_path_len check (char_length(trim(storage_path)) between 1 and 512),
  constraint portal_staff_announcement_media_sort check (sort_order >= 0)
);

create index if not exists portal_staff_announcement_media_ann_idx
  on public.portal_staff_announcement_media (announcement_id, sort_order, created_at);

comment on table public.portal_staff_announcement_media is
  'Photo attachments for portal_staff_announcements. Storage bucket portal-announcement-media, path {announcement_id}/{uuid}.ext';

alter table public.portal_staff_announcement_media enable row level security;

drop policy if exists portal_announcement_media_select_staff on public.portal_staff_announcement_media;
create policy portal_announcement_media_select_staff
  on public.portal_staff_announcement_media
  for select
  to authenticated
  using (public.portal_staff_is_staff_or_lead());

drop policy if exists portal_announcement_media_insert_admin on public.portal_staff_announcement_media;
create policy portal_announcement_media_insert_admin
  on public.portal_staff_announcement_media
  for insert
  to authenticated
  with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_announcement_media_delete_admin on public.portal_staff_announcement_media;
create policy portal_announcement_media_delete_admin
  on public.portal_staff_announcement_media
  for delete
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-announcement-media',
  'portal-announcement-media',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists portal_announcement_media_storage_select on storage.objects;
create policy portal_announcement_media_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'portal-announcement-media'
    and public.portal_staff_is_staff_or_lead()
  );

drop policy if exists portal_announcement_media_storage_insert on storage.objects;
create policy portal_announcement_media_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'portal-announcement-media'
    and public.portal_staff_profile_is_admin_or_ceo()
  );

drop policy if exists portal_announcement_media_storage_delete on storage.objects;
create policy portal_announcement_media_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'portal-announcement-media'
    and public.portal_staff_profile_is_admin_or_ceo()
  );

commit;
