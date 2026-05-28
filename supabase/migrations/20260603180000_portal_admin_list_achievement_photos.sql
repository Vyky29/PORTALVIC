-- Admin/CEO: list all achievement photos for a day (any staff, any status).

begin;

create or replace function public.portal_admin_list_achievement_photos_for_day(p_session_date date)
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
  portal_session_key text
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
    p.portal_session_key
  from public.portal_participant_achievement_photos p
  where p.session_date = p_session_date
    and public.portal_staff_profile_is_admin_or_ceo()
  order by p.client_name asc, p.created_at asc;
$$;

revoke all on function public.portal_admin_list_achievement_photos_for_day(date) from public;
grant execute on function public.portal_admin_list_achievement_photos_for_day(date) to authenticated;

comment on function public.portal_admin_list_achievement_photos_for_day(date) is
  'All achievement photos on a session_date for admin archive view (includes drafts from all staff).';

commit;
