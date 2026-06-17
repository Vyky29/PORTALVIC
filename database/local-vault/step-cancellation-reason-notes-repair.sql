-- Repair legacy cancellation_reports rows, then add notes + allow "Other".
-- Safe to re-run (idempotent).

begin;

alter table public.cancellation_reports
  add column if not exists notes text null;

-- Legacy client appended notes into reason_category when notes column was missing.
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

-- Normalise bare "Other — Notes: …" left from partial inserts.
update public.cancellation_reports
set
  reason_category = 'Other'
where reason_category ilike 'Other%'
  and reason_category <> 'Other';

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

comment on column public.cancellation_reports.notes is
  'Optional free-text context; reason_category stays one of the fixed illness/unforeseen/other values.';

commit;
