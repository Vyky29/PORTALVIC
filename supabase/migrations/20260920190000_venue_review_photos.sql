-- Venue review photos (staff can attach stills with the opening/closing check).

begin;

alter table public.venue_reviews
  add column if not exists photo_storage_paths jsonb not null default '[]'::jsonb;

comment on column public.venue_reviews.photo_storage_paths is
  'Private Storage paths in bucket venue-review-videos (still photos).';

update storage.buckets
set
  allowed_mime_types = array[
    'video/webm',
    'video/mp4',
    'video/quicktime',
    'video/ogg',
    'video/x-matroska',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif'
  ]::text[]
where id = 'venue-review-videos';

commit;
