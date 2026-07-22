-- Ikram Omar · NHS/SBS Day Centre: May must include Fri 1 May + Tue 5 May.
-- Was 13 × £750 = £9,750; now 15 × £750 = £11,250 (still excl BH Mon 4 & Mon 25).
-- May–Jul due: £11,250 + £13,500 + £13,500 = £38,250.

update public.client_payments
set
  amount = 38250,
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Sessions', 'May–Jul · 15+18+18 = 51 sess (MTW+F @ £750; May excl BH 4 & 25 only)',
    'May invoice (25/26)', 11250,
    'June invoice (25/26)', 13500,
    'July invoice (25/26)', 13500,
    'NHS due months', 'May £11,250 + Jun £13,500 + Jul £13,500 (incl 1 & 5 May)',
    'Summer basis', 'May £11,250 (15×£750 incl 1 & 5 May) + Jun £13,500 + Jul £13,500 = £38,250',
    'Year billed (25/26)', '£45,960',
    'Year received (25/26)', '£0',
    'Year outstanding', '£38,250',
    'May days (25/26)', '1, 5, 6, 8, 11, 12, 13, 15, 18, 19, 20, 22, 26, 27, 29 (excl BH 4 & 25)',
    'Next', 'Yr 25/26 NHS due May–Jul: £38,250 · May £11,250 (15 sess incl 1 & 5) + Jun £13,500 + Jul £13,500',
    'Payment status', 'Outstanding'
  )
where client_key = 'ikram-omar'
  and coalesce(data->>'Term', '') ilike '%summer%';
