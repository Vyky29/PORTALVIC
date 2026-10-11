-- Page the admin photo list. One response was capped at 1000 rows, so the
-- 171 Inbox (unassigned) photos (which sort after the first 1000 names) never arrived.

begin;

drop function if exists public.portal_admin_list_achievement_photos_all();

create or replace function public.portal_admin_list_achievement_photos_all(
  p_limit integer default 1000,
  p_offset integer default 0
)
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
  order by
    case when p.client_id = '_inbox' then 0 else 1 end,
    p.client_name asc,
    p.created_at asc
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.portal_admin_list_achievement_photos_all(integer, integer) from public;
grant execute on function public.portal_admin_list_achievement_photos_all(integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
