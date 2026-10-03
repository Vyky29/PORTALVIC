-- Hire upload stays separate from the cleaned photo families see.

alter table public.staff_profiles
  add column if not exists avatar_original_url text;

comment on column public.staff_profiles.avatar_original_url is
  'Original photo uploaded in onboarding. avatar_url is the cleaned display photo after the office saves it.';

update public.staff_profiles
set avatar_original_url = avatar_url
where coalesce(avatar_original_url, '') = ''
  and coalesce(avatar_url, '') <> ''
  and avatar_url not ilike '%/display.%';
