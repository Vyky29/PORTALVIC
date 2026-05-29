-- Allow admin/CEO to read incident_reports and cancellation_reports org-wide.
-- These tables only had insert + select-own; the CEO/admin strategic snapshot needs
-- aggregate read access. Mirrors session_feedback_select_admin_ceo / venue_reviews.
-- Run on Portal Supabase (cklpnwhlqsulpmkipmqb) in SQL Editor.

begin;

grant select on table public.incident_reports to authenticated;
grant select on table public.cancellation_reports to authenticated;

-- incident_reports: keep own-row read, add admin/ceo org-wide read.
drop policy if exists "incident_reports_select_own" on public.incident_reports;
create policy "incident_reports_select_own"
on public.incident_reports
for select
to authenticated
using (submitted_by_user_id = auth.uid());

drop policy if exists "incident_reports_select_admin_ceo" on public.incident_reports;
create policy "incident_reports_select_admin_ceo"
on public.incident_reports
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

-- cancellation_reports: keep own-row read, add admin/ceo org-wide read.
drop policy if exists "cancellation_reports_select_own" on public.cancellation_reports;
create policy "cancellation_reports_select_own"
on public.cancellation_reports
for select
to authenticated
using (submitted_by_user_id = auth.uid());

drop policy if exists "cancellation_reports_select_admin_ceo" on public.cancellation_reports;
create policy "cancellation_reports_select_admin_ceo"
on public.cancellation_reports
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

commit;
