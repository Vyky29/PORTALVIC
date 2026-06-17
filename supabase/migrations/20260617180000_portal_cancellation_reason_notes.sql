-- Cancellation reports: allow "Other" reason + optional notes column (staff often add context).
-- Fixes submit failures when notes were appended to reason_category (broke the enum check).

begin;

alter table public.cancellation_reports
  add column if not exists notes text null;

comment on column public.cancellation_reports.notes is
  'Optional free-text context; reason_category stays one of the fixed illness/unforeseen/other values.';

alter table public.cancellation_reports
  drop constraint if exists cancellation_reports_reason_category_check;

alter table public.cancellation_reports
  add constraint cancellation_reports_reason_category_check check (
    reason_category in (
      'Illness: Fever',
      'Illness: Diarrhoea',
      'Illness: Vomiting',
      'Illness: Seizure',
      'Illness: Cold/Flu',
      'Unforeseen circumstances: Venue incident',
      'Unforeseen circumstances: Fire alarm / Fire drill',
      'Unforeseen circumstances: Power cuts / Flooding',
      'Other'
    )
  );

commit;
