-- Mirror of database/migrations/20260610180000_portal_admin_absent_quick_marks.sql

-- Admin sessions hub: read staff absent quick marks org-wide (staff dashboard only writes quick marks, not session_feedback).

begin;

drop policy if exists "portal_quick_marks_select_admin" on public.portal_staff_session_quick_marks;
create policy "portal_quick_marks_select_admin"
on public.portal_staff_session_quick_marks
for select
to authenticated
using (public.portal_staff_profile_is_portal_admin());

create or replace function public.portal_admin_fetch_absent_quick_marks(
  p_since date default ((timezone('Europe/London', now()))::date - 120)
)
returns table (
  portal_session_key text,
  session_date date,
  created_at timestamptz,
  staff_user_id uuid,
  staff_name text
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    m.portal_session_key,
    m.session_date,
    m.created_at,
    m.staff_user_id,
    coalesce(
      nullif(trim(sp.full_name), ''),
      nullif(trim(sp.username), ''),
      'Staff'
    ) as staff_name
  from public.portal_staff_session_quick_marks m
  left join public.staff_profiles sp on sp.id = m.staff_user_id
  where public.portal_staff_profile_is_portal_admin()
    and m.mark_type = 'absent'
    and m.session_date >= coalesce(p_since, ((timezone('Europe/London', now()))::date - 120))
  order by m.created_at desc
  limit 500;
$$;

revoke all on function public.portal_admin_fetch_absent_quick_marks(date) from public;
grant execute on function public.portal_admin_fetch_absent_quick_marks(date) to authenticated;

comment on function public.portal_admin_fetch_absent_quick_marks(date) is
  'Operations admin: absent quick marks from staff dashboards for Sessions hub Absents + overview.';

commit;
