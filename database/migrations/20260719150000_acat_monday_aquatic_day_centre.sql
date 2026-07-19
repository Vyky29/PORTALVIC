-- ACAT Monday Aquatic (Jack S / Jack W / Kate / Kamy) → Summer 25/26 Day Centre, Paid.
-- £50 × 13 sessions = £650 each.

update public.client_payments
set
  client_name = regexp_replace(trim(client_name), '\s*\*+\s*$', '') || ' (ACAT)',
  payment_status = 'Paid',
  amount = 650,
  data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
    'Term', 'SUMMER TERM 25/26',
    'Stream', 'Day Centre',
    'Cohort', 'ACAT',
    'Services', '60'' Aquatic Activity, Monday - 11 to 12',
    'Cost', '£50 / session (60'' Aquatic)',
    'Summer basis', 'ACAT Mon 11–12 Aquatic · 13 × £50 = £650 · Paid',
    'Year billed (25/26)', '£650',
    'Year received (25/26)', '£650',
    'Year outstanding', '£0',
    'Next', 'Yr 25/26 ACAT Monday Aquatic: £650 billed · £650 paid · £0 due'
  )
where id in (
  '5f72aace-981f-4cc5-9cf3-090c814e83e1',
  '59ce5fe5-80ab-440e-bce6-57780457ad19',
  '1c8cd8f1-50c7-4bc5-8369-0cc8b6a278bd',
  'a591cddd-cfda-4155-bacc-e60113daea8a'
);
