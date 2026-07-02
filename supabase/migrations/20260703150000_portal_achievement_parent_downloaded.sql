-- Parent portal: track when families download achievement photos (status = downloaded).

begin;

alter table public.portal_participant_achievement_photos
  drop constraint if exists portal_achievement_photos_status_check;

alter table public.portal_participant_achievement_photos
  add constraint portal_achievement_photos_status_check
    check (status in ('draft', 'attached', 'archived_unused', 'downloaded'));

alter table public.portal_participant_achievement_photos
  add column if not exists parent_downloaded_at timestamptz null,
  add column if not exists parent_downloaded_by_contact_id text null;

comment on column public.portal_participant_achievement_photos.parent_downloaded_at is
  'When a linked parent downloaded this photo via the family portal.';

comment on column public.portal_participant_achievement_photos.parent_downloaded_by_contact_id is
  'portal_participants.contact_id of the child whose parent downloaded the photo.';

drop policy if exists portal_achievement_storage_select_staff_shared on storage.objects;
create policy portal_achievement_storage_select_staff_shared
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'participant-achievements'
    and public.portal_staff_can_use_achievement_photos()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.portal_participant_achievement_photos p
        where p.storage_path = objects.name
          and p.status in ('draft', 'attached', 'archived_unused', 'downloaded')
      )
    )
  );

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
  duration_ms int,
  parent_downloaded_at timestamptz
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
    p.duration_ms,
    p.parent_downloaded_at
  from public.portal_participant_achievement_photos p
  where public.portal_staff_profile_is_admin_or_ceo()
  order by p.client_name asc, p.created_at asc;
$$;

revoke all on function public.portal_admin_list_achievement_photos_all() from public;
grant execute on function public.portal_admin_list_achievement_photos_all() to authenticated;

commit;
