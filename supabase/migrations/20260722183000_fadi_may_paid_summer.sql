-- Fadi Abu daud · NHS/SBS: May 25/26 paid.
-- Was due May–Jul £38,850; May £9,712.50 received → Jun+Jul outstanding £29,137.50.

update public.client_payments
set
  amount = 29137.50,
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'May paid (25/26)', 9712.50,
    'June invoice (25/26)', 14245,
    'July invoice (25/26)', 14892.50,
    'NHS due months', 'Jun £14,245 + Jul £14,892.50 (May £9,712.50 paid)',
    'Summer basis', 'May £9,712.50 paid · Jun £14,245 + Jul £14,892.50 due = £29,137.50',
    'Year billed (25/26)', '£119,787.50',
    'Year received (25/26)', '£97,125',
    'Year outstanding', '£29,137.50',
    'Next', 'Yr 25/26 NHS due Jun–Jul: £29,137.50 · Jun £14,245 + Jul £14,892.50 (May paid)',
    'Payment status', 'Outstanding'
  )
where client_key = 'fadi'
  and coalesce(data->>'Term', '') ilike '%summer%';
