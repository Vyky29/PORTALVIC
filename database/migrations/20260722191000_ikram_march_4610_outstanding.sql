-- Ikram Omar: add March 25/26 invoice £4,610 outstanding.
-- Was Apr–Jul £46,150 → Mar–Jul due £50,760.

update public.client_payments
set
  amount = 50760,
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'March invoice (25/26)', 4610,
    'April invoice (25/26)', 10150,
    'May invoice (25/26)', 9000,
    'June invoice (25/26)', 13500,
    'July invoice (25/26)', 13500,
    'April–May invoices (25/26)', 19150,
    'Sessions', 'Mar–Jul outstanding · Mar £4,610 + Apr £10,150 + May–Jul Day Centre',
    'NHS due months', 'Mar £4,610 + Apr £10,150 + May £9,000 + Jun £13,500 + Jul £13,500',
    'Summer basis', 'Mar £4,610 + Apr £10,150 + May £9,000 + Jun £13,500 + Jul £13,500 = £50,760',
    'Year billed (25/26)', '£50,760',
    'Year received (25/26)', '£0',
    'Year outstanding', '£50,760',
    'Extras', 'Mar £4,610 + Apr £10,150 outstanding · + May–Jul Day Centre',
    'Next', 'Yr 25/26 NHS due Mar–Jul: £50,760 · Mar £4,610 + Apr £10,150 + May £9,000 + Jun £13,500 + Jul £13,500',
    'Payment status', 'Outstanding'
  )
where client_key = 'ikram-omar'
  and coalesce(data->>'Term', '') ilike '%summer%';
