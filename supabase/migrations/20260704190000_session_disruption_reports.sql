-- Staff Session Disruption Report (same-day / planned absence).
-- Linked to POL-048; day-off rows upserted via portal-session-disruption-submit Edge Function.

begin;

create table if not exists public.session_disruption_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  role_label text,
  disruption_type text not null,
  session_date date not null,
  venue text not null,
  reason_category text not null,
  reason_description text,
  expected_return text not null,
  return_date date,
  could_prevent text not null,
  prevention_details text,
  additional_comments text,
  declaration_accepted boolean not null default false,
  origin text not null default 'dashboard',
  day_off_recorded boolean not null default false,
  constraint session_disruption_reports_disruption_type_check check (
    disruption_type in ('Same-Day Absence', 'Planned Absence')
  ),
  constraint session_disruption_reports_reason_category_check check (
    reason_category in (
      'Illness',
      'Family Emergency',
      'Medical Appointment',
      'Bereavement',
      'Vehicle Breakdown',
      'Transport Disruption',
      'Annual Leave',
      'Other'
    )
  ),
  constraint session_disruption_reports_expected_return_check check (
    expected_return in (
      'Next scheduled session',
      'Return on a specific date',
      'Unknown at this stage'
    )
  ),
  constraint session_disruption_reports_could_prevent_check check (
    could_prevent in ('No', 'Yes', 'Unsure')
  ),
  constraint session_disruption_reports_origin_check check (
    origin in ('dashboard', 'quick_menu', 'policy', 'direct')
  )
);

comment on table public.session_disruption_reports is
  'Staff absence / session disruption reports (POL-048). Day off synced to staff_unavailability via Edge Function.';

create index if not exists session_disruption_reports_user_idx
  on public.session_disruption_reports (submitted_by_user_id);

create index if not exists session_disruption_reports_session_date_idx
  on public.session_disruption_reports (session_date desc);

create index if not exists session_disruption_reports_created_at_idx
  on public.session_disruption_reports (created_at desc);

alter table public.session_disruption_reports enable row level security;

grant insert, select on table public.session_disruption_reports to authenticated;

drop policy if exists "session_disruption_reports_insert_staff_lead" on public.session_disruption_reports;
create policy "session_disruption_reports_insert_staff_lead"
on public.session_disruption_reports
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
  and declaration_accepted = true
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead')
  )
);

drop policy if exists "session_disruption_reports_select_own" on public.session_disruption_reports;
create policy "session_disruption_reports_select_own"
on public.session_disruption_reports
for select
to authenticated
using (submitted_by_user_id = auth.uid());

drop policy if exists "session_disruption_reports_admin_select" on public.session_disruption_reports;
create policy "session_disruption_reports_admin_select"
on public.session_disruption_reports
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
