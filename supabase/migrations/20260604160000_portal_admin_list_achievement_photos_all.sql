-- Admin/CEO: list ALL achievement photos (any day, any staff, any status) for the
-- participant directory view (grouped alphabetically in the admin dashboard).

begin;

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
    p.session_date,
    p.portal_session_key
  from public.portal_participant_achievement_photos p
  where public.portal_staff_profile_is_admin_or_ceo()
  order by p.client_name asc, p.created_at asc;
$$;

revoke all on function public.portal_admin_list_achievement_photos_all() from public;
grant execute on function public.portal_admin_list_achievement_photos_all() to authenticated;

comment on function public.portal_admin_list_achievement_photos_all() is
  'All achievement photos (any day/staff/status) for the admin participant directory view.';

commit;
