-- Cancellation reports: allow "Other" reason + optional notes column (staff often add context).
-- Fixes submit failures when notes were appended to reason_category (broke the enum check).

begin;

alter table public.cancellation_reports
  add column if not exists notes text null;

update public.cancellation_reports
set
  notes = coalesce(
    nullif(trim(notes), ''),
    nullif(trim(regexp_replace(reason_category, '^.* — Notes:\s*', '', 'i')), '')
  ),
  reason_category = trim(
    regexp_replace(
      regexp_replace(reason_category, '\s*—\s*Notes:.*$', '', 'i'),
      '\s*—\s*Service:.*$',
      '',
      'i'
    )
  )
where reason_category ~* '( — Notes:| — Service:)';

update public.cancellation_reports
set reason_category = 'Other'
where reason_category ilike 'Other%'
  and reason_category <> 'Other';

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
