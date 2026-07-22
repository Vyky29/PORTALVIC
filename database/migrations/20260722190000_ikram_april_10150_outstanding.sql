-- Ikram Omar: add April 25/26 invoice £10,150 outstanding.
-- May–Jul was £36,000 → Apr–Jul due £46,150.

update public.client_payments
set
  amount = 46150,
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'April invoice (25/26)', 10150,
    'May invoice (25/26)', 9000,
    'June invoice (25/26)', 13500,
    'July invoice (25/26)', 13500,
    'April–May invoices (25/26)', 19150,
    'Sessions', 'Apr–Jul outstanding · Apr £10,150 + May 12×£750 + Jun/Jul 18×£750',
    'NHS due months', 'Apr £10,150 + May £9,000 + Jun £13,500 + Jul £13,500',
    'Summer basis', 'Apr £10,150 + May £9,000 + Jun £13,500 + Jul £13,500 = £46,150',
    'Year billed (25/26)', '£46,150',
    'Year received (25/26)', '£0',
    'Year outstanding', '£46,150',
    'Extras', 'Apr invoice £10,150 outstanding · + May–Jul Day Centre',
    'Next', 'Yr 25/26 NHS due Apr–Jul: £46,150 · Apr £10,150 + May £9,000 + Jun £13,500 + Jul £13,500',
    'Payment status', 'Outstanding'
  )
where client_key = 'ikram-omar'
  and coalesce(data->>'Term', '') ilike '%summer%';
