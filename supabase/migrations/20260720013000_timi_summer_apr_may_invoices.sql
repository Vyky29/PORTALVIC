-- Timi Day Centre Summer 25/26 Total =
--   18 × £350 (Mon & Fri 11–1, 1 Jun – 31 Jul 2026) = £6,300
-- + April invoice £500 + May invoice £500 = £1,000
-- = £7,300

update public.client_payments
set
  amount = 7300,
  client_name = 'Timi Dairo',
  payment_status = 'Outstanding',
  data = (
    coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
      'Services', E'120'' Day Centre, Monday - 11 am to 1 pm\n120'' Day Centre, Friday - 11 am to 1 pm',
      'Paid', 'Funded by NHS',
      'Invoice type', 'NHS (Exempt invoice)',
      'Funding', 'NHS (Exempt invoice)',
      'Funder', 'NHS · SBS',
      'Funding origin', 'NHS-funded',
      'Payer', 'Local authority / NHS (pays direct)',
      'Payment method', 'NHS invoice (PO)',
      'Term', 'SUMMER TERM 25/26',
      'Cost', '£350 / session (2:1)',
      'Sessions', 'Mon & Fri · 11–1 · 18 sess (1 Jun – 31 Jul 2026) + Apr/May invoices',
      'Weekly', '£700 (2 × £350)',
      'VAT', 'Exempt',
      'Invoice', 'April £500 · May £500 (1:1 extras) + Jun–Jul Day Centre',
      'Payment status', 'Outstanding',
      'April invoice (25/26)', 500,
      'May invoice (25/26)', 500,
      'April–May invoices (25/26)', 1000,
      'Extras', 'Apr £500 + May £500 (1:1 extras) · + Jun/Jul day centre',
      'Summer basis', '18 × £350 = £6,300 + Apr £500 + May £500 = £7,300',
      'Year billed (25/26)', '£7,300',
      'Year received (25/26)', '£0',
      'Year outstanding', '£7,300',
      'Next', 'Summer 25/26: £7,300 · 18 sess Mon/Fri 11–1 (Jun–Jul) + Apr/May invoices £1,000'
    )
  )::json
where client_key = 'timi'
  and (
    coalesce(data->>'Term', '') ilike '%SUMMER%25%'
    or coalesce(data->>'Term', '') ilike '%Summer term 2026%'
    or coalesce(data->>'Term', '') ilike '%SUMMER TERM 25%'
  );
