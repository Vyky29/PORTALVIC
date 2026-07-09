-- Session Disruption reports: admin validation.
-- The staff-facing "Day off (Time Off Requested)" is now GATED on admin
-- validation: submit only records the report; validating it (admin) is what
-- upserts staff_unavailability so the day replaces the shift on the dashboard.

begin;

alter table public.session_disruption_reports
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by uuid references auth.users (id) on delete set null,
  add column if not exists validated_by_name text;

create index if not exists session_disruption_reports_validated_idx
  on public.session_disruption_reports (validated_at);

comment on column public.session_disruption_reports.validated_at is
  'When an admin validated this report. Null = pending admin validation.';
comment on column public.session_disruption_reports.validated_by is
  'auth.users id of the admin/CEO who validated the report.';

commit;
