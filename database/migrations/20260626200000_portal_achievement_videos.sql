-- Participant achievements: short in-app videos attachable to session feedback (same table as photos).

begin;

alter table public.portal_participant_achievement_photos
  add column if not exists media_type text not null default 'photo',
  add column if not exists duration_ms int null;

alter table public.portal_participant_achievement_photos
  drop constraint if exists portal_achievement_photos_media_type_check;

alter table public.portal_participant_achievement_photos
  add constraint portal_achievement_photos_media_type_check
  check (media_type in ('photo', 'video'));

update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'video/webm',
    'video/mp4',
    'video/quicktime'
  ]::text[]
where id = 'participant-achievements';

drop function if exists public.portal_list_participant_achievement_drafts(text, date, text);

create or replace function public.portal_list_participant_achievement_drafts(
  p_client_id text,
  p_session_date date,
  p_portal_session_key text default null
)
returns table (
  id uuid,
  storage_path text,
  created_at timestamptz,
  width int,
  height int,
  staff_user_id uuid,
  staff_display_name text,
  media_type text,
  duration_ms int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.storage_path,
    p.created_at,
    p.width,
    p.height,
    p.staff_user_id,
    p.staff_display_name,
    p.media_type,
    p.duration_ms
  from public.portal_participant_achievement_photos p
  where p.status = 'draft'
    and p.session_date = p_session_date
    and p.client_id = public.portal_normalize_achievement_client_id(p_client_id)
    and (
      p.client_id <> '_inbox'
      or p.staff_user_id = auth.uid()
    )
    and public.portal_staff_can_use_achievement_photos()
  order by p.created_at asc;
$$;

revoke all on function public.portal_list_participant_achievement_drafts(text, date, text) from public;
grant execute on function public.portal_list_participant_achievement_drafts(text, date, text) to authenticated;

comment on function public.portal_list_participant_achievement_drafts(text, date, text) is
  'Draft achievement photos/videos for client+day; inbox (_inbox) scoped to the uploading staff member.';

drop function if exists public.portal_admin_list_achievement_photos_all();

create or replace function public.portal_admin_list_achievement_photos_all()
returns table (
  id uuid,
  staff_user_id uuid,
  staff_display_name text,
  client_name text,
  client_id text,
  status text,
  storage_path text,
  session_feedback_id uuid,
  created_at timestamptz,
  session_date date,
  portal_session_key text,
  media_type text,
  duration_ms int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.staff_user_id,
    p.staff_display_name,
    p.client_name,
    p.client_id,
    p.status,
    p.storage_path,
    p.session_feedback_id,
    p.created_at,
    p.session_date,
    p.portal_session_key,
    p.media_type,
    p.duration_ms
  from public.portal_participant_achievement_photos p
  where public.portal_staff_profile_is_admin_or_ceo()
  order by p.client_name asc, p.created_at asc;
$$;

revoke all on function public.portal_admin_list_achievement_photos_all() from public;
grant execute on function public.portal_admin_list_achievement_photos_all() to authenticated;

comment on function public.portal_admin_list_achievement_photos_all() is
  'All achievement photos/videos (any day/staff/status) for the admin participant directory view.';

comment on column public.portal_participant_achievement_photos.media_type is
  'photo (default) or video — both attach to session feedback via portal_finalize_achievement_photos.';

commit;
