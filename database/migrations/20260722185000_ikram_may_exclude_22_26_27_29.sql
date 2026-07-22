-- Ikram Omar May: also exclude 22, 26, 27, 29 May.
-- Billable May days: 1, 5, 6, 8, 11, 12, 13, 15, 18, 19, 20 = 11 × £750 = £8,250
-- May–Jul due: £8,250 + £13,500 + £13,500 = £35,250

update public.client_payments
set
  amount = 35250,
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Sessions', 'May–Jul · 11+18+18 = 47 sess (MTW+F @ £750)',
    'May invoice (25/26)', 8250,
    'June invoice (25/26)', 13500,
    'July invoice (25/26)', 13500,
    'NHS due months', 'May £8,250 + Jun £13,500 + Jul £13,500',
    'Summer basis', 'May £8,250 (11×£750) + Jun £13,500 + Jul £13,500 = £35,250',
    'Year billed (25/26)', '£42,960',
    'Year received (25/26)', '£0',
    'Year outstanding', '£35,250',
    'May days (25/26)', '1, 5, 6, 8, 11, 12, 13, 15, 18, 19, 20 (excl BH 4 & 25; excl 22, 26, 27, 29)',
    'Next', 'Yr 25/26 NHS due May–Jul: £35,250 · May £8,250 (11 sess) + Jun £13,500 + Jul £13,500',
    'Payment status', 'Outstanding'
  )
where client_key = 'ikram-omar'
  and coalesce(data->>'Term', '') ilike '%summer%';
