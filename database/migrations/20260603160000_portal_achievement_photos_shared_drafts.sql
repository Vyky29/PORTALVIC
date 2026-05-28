-- Shared achievement drafts (co-instructors, same participant slot) + staff read peers' storage.

begin;

create or replace function public.portal_normalize_achievement_client_id(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(coalesce(p, '')));
$$;

revoke all on function public.portal_normalize_achievement_client_id(text) from public;
grant execute on function public.portal_normalize_achievement_client_id(text) to authenticated;

comment on function public.portal_normalize_achievement_client_id(text) is
  'Lowercase trim for portal_participant_achievement_photos.client_id matching.';

-- List draft photos for a participant on a day (all staff on same portal_session_key when provided).
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
  staff_display_name text
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
    p.staff_display_name
  from public.portal_participant_achievement_photos p
  where p.status = 'draft'
    and p.session_date = p_session_date
    and p.client_id = public.portal_normalize_achievement_client_id(p_client_id)
    and public.portal_staff_is_staff_or_lead()
    and (
      nullif(trim(coalesce(p_portal_session_key, '')), '') is null
      or p.portal_session_key is null
      or p.portal_session_key = nullif(trim(p_portal_session_key), '')
    )
  order by p.created_at asc;
$$;

revoke all on function public.portal_list_participant_achievement_drafts(text, date, text) from public;
grant execute on function public.portal_list_participant_achievement_drafts(text, date, text) to authenticated;

comment on function public.portal_list_participant_achievement_drafts(text, date, text) is
  'Draft achievement photos for client+day; optional portal_session_key limits to same roster slot (co-instructors).';

-- Staff may read storage for any draft row (paths only exposed via RPC / table policies).
drop policy if exists portal_achievement_storage_select_staff_shared on storage.objects;
create policy portal_achievement_storage_select_staff_shared
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'participant-achievements'
    and public.portal_staff_is_staff_or_lead()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.portal_participant_achievement_photos p
        where p.storage_path = objects.name
          and p.status = 'draft'
      )
    )
  );

commit;
