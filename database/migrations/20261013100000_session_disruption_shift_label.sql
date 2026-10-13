-- Session disruption reports name the shift: Day, Morning, or Afternoon.

begin;

alter table public.session_disruption_reports
  add column if not exists shift_label text;

alter table public.session_disruption_reports
  drop constraint if exists session_disruption_reports_shift_label_check;

alter table public.session_disruption_reports
  add constraint session_disruption_reports_shift_label_check
  check (shift_label is null or shift_label in ('Day', 'Morning', 'Afternoon'));

comment on column public.session_disruption_reports.shift_label is
  'Day when the worker has one block or marked both shifts. Morning or Afternoon when they picked one of two.';

commit;
