-- Ikram Omar May: include Fri 22 May again.
-- Days: 1, 5, 6, 8, 11, 12, 13, 15, 18, 19, 20, 22 = 12 × £750 = £9,000
-- Still excl BH 4 & 25 and 26, 27, 29.
-- May–Jul due: £9,000 + £13,500 + £13,500 = £36,000

update public.client_payments
set
  amount = 36000,
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Sessions', 'May–Jul · 12+18+18 = 48 sess (MTW+F @ £750)',
    'May invoice (25/26)', 9000,
    'June invoice (25/26)', 13500,
    'July invoice (25/26)', 13500,
    'NHS due months', 'May £9,000 + Jun £13,500 + Jul £13,500',
    'Summer basis', 'May £9,000 (12×£750) + Jun £13,500 + Jul £13,500 = £36,000',
    'Year billed (25/26)', '£43,710',
    'Year received (25/26)', '£0',
    'Year outstanding', '£36,000',
    'May days (25/26)', '1, 5, 6, 8, 11, 12, 13, 15, 18, 19, 20, 22 (excl BH 4 & 25; excl 26, 27, 29)',
    'Next', 'Yr 25/26 NHS due May–Jul: £36,000 · May £9,000 (12 sess incl 22) + Jun £13,500 + Jul £13,500',
    'Payment status', 'Outstanding'
  )
where client_key = 'ikram-omar'
  and coalesce(data->>'Term', '') ilike '%summer%';
