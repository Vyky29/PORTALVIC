-- Single active login: bump counter on each password login so other browsers can detect and sign out.
-- Cross-device review colours: staff can SELECT their own submitted rows from feedback / incident / cancellation.

begin;

-- 1) staff_profiles: monotonic generation (incremented from app on each new login)
alter table public.staff_profiles
  add column if not exists auth_session_generation bigint not null default 0;

create or replace function public.portal_bump_auth_session_generation()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  update public.staff_profiles
    set auth_session_generation = coalesce(auth_session_generation, 0) + 1
  where id = auth.uid()
  returning auth_session_generation into v;
  return coalesce(v, 0);
end;
$$;

grant execute on function public.portal_bump_auth_session_generation() to authenticated;

-- 2) session_feedback: submitter can read own rows (for dashboard sync)
drop policy if exists "session_feedback_select_own" on public.session_feedback;
create policy "session_feedback_select_own"
on public.session_feedback
for select
to authenticated
using (submitted_by_user_id = auth.uid());

-- 3) incident_reports: submitter can read own rows
drop policy if exists "incident_reports_select_own" on public.incident_reports;
create policy "incident_reports_select_own"
on public.incident_reports
for select
to authenticated
using (submitted_by_user_id = auth.uid());

-- 4) cancellation_reports: submitter can read own rows
drop policy if exists "cancellation_reports_select_own" on public.cancellation_reports;
create policy "cancellation_reports_select_own"
on public.cancellation_reports
for select
to authenticated
using (submitted_by_user_id = auth.uid());

commit;
