-- Run on Portal Supabase (cklpnwhlqsulpmkipmqb) → SQL Editor.
-- Fixes: admin Alerts bell empty + Online bar not listing connected staff.
-- Paste and run as one script (three transactions).

-- 1) Admin/CEO by corporate email (Victor, Raúl, Javi, Sevitha, …)
begin;

create or replace function public.portal_staff_profile_is_admin_or_ceo()
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
          or public.portal_profile_staff_key(sp.id) in (
            'sevitha', 'victor', 'javi', 'javier', 'raul', 'palankas'
          )
        )
    );
$$;

commit;

-- 2) Alerts bell RLS + absent quick marks RPC
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

-- 3) Online bar + live map email fallback
begin;

create or replace function public.portal_staff_can_view_live_map()
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
      where sp.id = auth.uid()
        and coalesce(sp.is_active, true)
        and (
          lower(coalesce(nullif(trim(sp.app_role), ''), '')) in ('admin', 'ceo')
          or lower(coalesce(nullif(trim(sp.staff_role), ''), '')) in ('manager', 'admin')
          or public.portal_profile_staff_key(sp.id) in (
            'sevitha',
            'victor',
            'javi',
            'javier',
            'raul'
          )
        )
    );
$$;

create or replace function public.portal_admin_fetch_online_staff(
  p_visit_stale_seconds integer default 90
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security to off
as $$
  with london_today as (
    select (timezone('Europe/London', now()))::date as d
  ),
  loc as (
    select
      l.staff_user_id,
      l.staff_display_name as name,
      l.updated_at as at
    from public.portal_staff_live_locations l
    where public.portal_staff_profile_is_admin_or_ceo()
      and l.is_sharing = true
      and l.updated_at >= now() - interval '20 minutes'
  ),
  visits as (
    select
      v.staff_user_id,
      v.staff_display_name as name,
      v.last_seen_at as at
    from public.portal_staff_visit_sessions v
    cross join london_today lt
    where public.portal_staff_profile_is_admin_or_ceo()
      and v.still_open = true
      and v.session_date = lt.d
      and v.last_seen_at >= now() - make_interval(secs => greatest(coalesce(p_visit_stale_seconds, 90), 30))
  ),
  merged as (
    select * from loc
    union all
    select * from visits
  ),
  deduped as (
    select distinct on (staff_user_id)
      staff_user_id,
      name,
      at
    from merged
    order by staff_user_id, at desc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'staff_user_id', staff_user_id,
        'name', name,
        'at', at
      )
      order by lower(trim(coalesce(name, '')))
    ),
    '[]'::jsonb
  )
  from deduped;
$$;

commit;
