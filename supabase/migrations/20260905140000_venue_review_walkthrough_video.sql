-- Venue review walkthrough videos (Roberto Sunday open/close): private Storage + columns on venue_reviews.

begin;

alter table public.venue_reviews
  add column if not exists video_storage_path text null,
  add column if not exists video_mime_type text null,
  add column if not exists video_duration_sec numeric(8, 2) null;

comment on column public.venue_reviews.video_storage_path is
  'Private Storage path in bucket venue-review-videos (internal walkthrough).';
comment on column public.venue_reviews.video_mime_type is
  'MIME type of the walkthrough video (e.g. video/webm, video/mp4).';
comment on column public.venue_reviews.video_duration_sec is
  'Approximate recorded duration in seconds.';

create index if not exists venue_reviews_video_storage_path_idx
  on public.venue_reviews (video_storage_path)
  where video_storage_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'venue-review-videos',
  'venue-review-videos',
  false,
  52428800,
  array[
    'video/webm',
    'video/mp4',
    'video/quicktime',
    'video/ogg',
    'video/x-matroska'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists venue_review_videos_storage_select on storage.objects;
create policy venue_review_videos_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'venue-review-videos'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  );

drop policy if exists venue_review_videos_storage_insert on storage.objects;
create policy venue_review_videos_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'venue-review-videos'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  );

drop policy if exists venue_review_videos_storage_update on storage.objects;
create policy venue_review_videos_storage_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'venue-review-videos'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  )
  with check (
    bucket_id = 'venue-review-videos'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  );

drop policy if exists venue_review_videos_storage_delete on storage.objects;
create policy venue_review_videos_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'venue-review-videos'
    and (
      public.portal_staff_profile_is_admin_or_ceo()
      or public.portal_staff_is_staff_or_lead()
    )
  );

commit;
