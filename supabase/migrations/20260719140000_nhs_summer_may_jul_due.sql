-- NHS Summer 25/26 outstanding = office sheet May–Jul remaining (XXPRASHERV1).
-- Plus Timi Abr–May extras £500 + £500.

update public.client_payments
set
  amount = 38850,
  payment_status = 'Outstanding',
  data = data
    || jsonb_build_object(
      'Year outstanding', '£38,850',
      'NHS due months', 'May £9,712.50 + Jun £14,245 + Jul £14,892.50 (XXPRASHERV1)',
      'Next', 'Yr 25/26 NHS due May–Jul: £38,850 · May £9,712.50 + Jun £14,245 + Jul £14,892.50 (XXPRASHERV1)'
    )
where client_key = 'fadi'
  and coalesce(data->>'Term', '') ilike '%summer%';

update public.client_payments
set
  amount = 36750,
  payment_status = 'Outstanding',
  data = data
    || jsonb_build_object(
      'Year outstanding', '£36,750',
      'NHS due months', 'May £9,750 + Jun £13,500 + Jul £13,500 (XXPRASHERV1)',
      'Next', 'Yr 25/26 NHS due May–Jul: £36,750 · May £9,750 + Jun £13,500 + Jul £13,500 (XXPRASHERV1)'
    )
where client_key = 'ikram-omar'
  and coalesce(data->>'Term', '') ilike '%summer%';

update public.client_payments
set
  amount = 13500,
  payment_status = 'Outstanding',
  data = data
    || jsonb_build_object(
      'Year outstanding', '£13,500',
      'NHS due months', 'Jun £6,500 + Jul £7,000 (XXPRASHERV1)',
      'Next', 'Yr 25/26 NHS due May–Jul: £13,500 · Jun £6,500 + Jul £7,000 (XXPRASHERV1)'
    )
where client_key = 'emanuel'
  and coalesce(data->>'Term', '') ilike '%summer%';

update public.client_payments
set
  amount = 7300,
  payment_status = 'Outstanding',
  data = data
    || jsonb_build_object(
      'Extras', 'Apr £500 + May £500 (1:1 extras) · + Jun/Jul day centre',
      'Summer basis', 'Jun–Jul 18 × £350 = £6,300 + Abr–May extras £500+£500 = £7,300',
      'Year billed (25/26)', '£7,300',
      'Year outstanding', '£7,300',
      'Sessions', 'Mon & Fri · 11–1 · 18 sess (from 1 Jun 2026) + Abr–May extras £500+£500',
      'Next', 'Summer 25/26: £7,300 billed · Mon & Fri 11–1 (Jun–Jul) + Abr–May extras £1,000'
    )
where client_key = 'timi'
  and (
    coalesce(data->>'Term', '') ilike '%SUMMER%25%'
    or coalesce(data->>'Term', '') ilike '%Summer term 2026%'
  );
