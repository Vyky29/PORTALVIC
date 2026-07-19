-- ACAT Mon 11–12 Aquatic on Autumn 26/27 Day Centre (Using Funds from LA · Outstanding until paid).
-- 14 weekday Mondays × £50 = £700 each.

insert into public.client_payments (
  sheet, row_index, client_key, client_name, parent_name, payment_status, amount, data, source_file
)
select v.sheet, v.row_index, v.client_key, v.client_name, v.parent_name, v.payment_status, v.amount, v.data, v.source_file
from (values
  (
    'DIRECT_PAYMENTS'::text, 2010, 'jacks', 'Jack S (ACAT)', 'ACAT / Direct Payments', 'Outstanding', 700::numeric,
    jsonb_build_object(
      'Term', 'AUTUMN TERM 26/27',
      'Stream', 'Day Centre',
      'Cohort', 'ACAT',
      'Services', '60'' Aquatic Activity, Monday - 11 to 12',
      'Paid', 'Using Funds from LA',
      'Invoice type', 'Parent (Exempt invoice)',
      'Cost', '£50 / session (60'' Aquatic)',
      'Sessions', '14',
      'Autumn basis', 'ACAT Mon 11–12 Aquatic · 14 × £50 = £700 · Outstanding',
      'Year billed (26/27)', '£700',
      'Year received (26/27)', '£0',
      'Year outstanding', '£700',
      'Next', 'Autumn 26/27 ACAT Monday Aquatic: £700 billed · not yet paid'
    ),
    'manual-portal-2026-07-19-acat-autumn'
  ),
  (
    'DIRECT_PAYMENTS', 2011, 'jackw', 'Jack W (ACAT)', 'ACAT / Direct Payments', 'Outstanding', 700,
    jsonb_build_object(
      'Term', 'AUTUMN TERM 26/27',
      'Stream', 'Day Centre',
      'Cohort', 'ACAT',
      'Services', '60'' Aquatic Activity, Monday - 11 to 12',
      'Paid', 'Using Funds from LA',
      'Invoice type', 'Parent (Exempt invoice)',
      'Cost', '£50 / session (60'' Aquatic)',
      'Sessions', '14',
      'Autumn basis', 'ACAT Mon 11–12 Aquatic · 14 × £50 = £700 · Outstanding',
      'Year billed (26/27)', '£700',
      'Year received (26/27)', '£0',
      'Year outstanding', '£700',
      'Next', 'Autumn 26/27 ACAT Monday Aquatic: £700 billed · not yet paid'
    ),
    'manual-portal-2026-07-19-acat-autumn'
  ),
  (
    'DIRECT_PAYMENTS', 2012, 'kate', 'Kate (ACAT)', 'ACAT / Direct Payments', 'Outstanding', 700,
    jsonb_build_object(
      'Term', 'AUTUMN TERM 26/27',
      'Stream', 'Day Centre',
      'Cohort', 'ACAT',
      'Services', '60'' Aquatic Activity, Monday - 11 to 12',
      'Paid', 'Using Funds from LA',
      'Invoice type', 'Parent (Exempt invoice)',
      'Cost', '£50 / session (60'' Aquatic)',
      'Sessions', '14',
      'Autumn basis', 'ACAT Mon 11–12 Aquatic · 14 × £50 = £700 · Outstanding',
      'Year billed (26/27)', '£700',
      'Year received (26/27)', '£0',
      'Year outstanding', '£700',
      'Next', 'Autumn 26/27 ACAT Monday Aquatic: £700 billed · not yet paid'
    ),
    'manual-portal-2026-07-19-acat-autumn'
  ),
  (
    'DIRECT_PAYMENTS', 2013, 'kamy', 'Kamy (ACAT)', 'ACAT / Direct Payments', 'Outstanding', 700,
    jsonb_build_object(
      'Term', 'AUTUMN TERM 26/27',
      'Stream', 'Day Centre',
      'Cohort', 'ACAT',
      'Services', '60'' Aquatic Activity, Monday - 11 to 12',
      'Paid', 'Using Funds from LA',
      'Invoice type', 'Parent (Exempt invoice)',
      'Cost', '£50 / session (60'' Aquatic)',
      'Sessions', '14',
      'Autumn basis', 'ACAT Mon 11–12 Aquatic · 14 × £50 = £700 · Outstanding',
      'Year billed (26/27)', '£700',
      'Year received (26/27)', '£0',
      'Year outstanding', '£700',
      'Next', 'Autumn 26/27 ACAT Monday Aquatic: £700 billed · not yet paid'
    ),
    'manual-portal-2026-07-19-acat-autumn'
  )
) as v(sheet, row_index, client_key, client_name, parent_name, payment_status, amount, data, source_file)
where not exists (
  select 1 from public.client_payments cp
  where cp.client_key = v.client_key
    and coalesce(cp.data->>'Term','') ilike '%AUTUMN%26%'
    and coalesce(cp.data->>'Cohort','') = 'ACAT'
);

-- Correct any Autumn ACAT rows previously inserted as Paid.
update public.client_payments
set
  payment_status = 'Outstanding',
  data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
    'Payment status', 'Outstanding',
    'Year received (26/27)', '£0',
    'Year outstanding', '£700',
    'Autumn basis', 'ACAT Mon 11–12 Aquatic · 14 × £50 = £700 · Outstanding',
    'Next', 'Autumn 26/27 ACAT Monday Aquatic: £700 billed · not yet paid'
  )
where coalesce(data->>'Cohort','') = 'ACAT'
  and coalesce(data->>'Term','') ilike '%AUTUMN%26%';
