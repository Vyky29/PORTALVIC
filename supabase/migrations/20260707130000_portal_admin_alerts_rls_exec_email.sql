-- Admin alerts bell + day-ops badges: corporate exec emails must read incidents,
-- cancellations, absents, and late approvals even when staff_profiles.id lags.

begin;

create or replace function public.portal_staff_profile_is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select
    public.portal_auth_email_is_achievement_admin()
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and coalesce(sp.is_active, true)
        and (
          sp.app_role in ('admin', 'ceo')
          or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
          or public.portal_profile_staff_key(sp.id) in ('sevitha')
        )
    );
$$;

drop policy if exists "incident_reports_select_admin_ceo" on public.incident_reports;
create policy "incident_reports_select_admin_ceo"
on public.incident_reports
for select
to authenticated
using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "cancellation_reports_select_admin_ceo" on public.cancellation_reports;
create policy "cancellation_reports_select_admin_ceo"
on public.cancellation_reports
for select
to authenticated
using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_quick_marks_select_admin" on public.portal_staff_session_quick_marks;
create policy "portal_quick_marks_select_admin"
on public.portal_staff_session_quick_marks
for select
to authenticated
using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_late_submission_select_own" on public.portal_late_submission_requests;
create policy "portal_late_submission_select_own"
on public.portal_late_submission_requests
for select
to authenticated
using (
  staff_user_id = auth.uid()
  or public.portal_staff_profile_is_admin_or_ceo()
);

drop policy if exists "portal_late_submission_update_admin" on public.portal_late_submission_requests;
create policy "portal_late_submission_update_admin"
on public.portal_late_submission_requests
for update
to authenticated
using (public.portal_staff_profile_is_admin_or_ceo())
with check (public.portal_staff_profile_is_admin_or_ceo());

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
  where public.portal_staff_profile_is_admin_or_ceo()
    and m.mark_type = 'absent'
    and m.session_date >= coalesce(p_since, ((timezone('Europe/London', now()))::date - 120))
  order by m.created_at desc
  limit 500;
$$;

commit;
