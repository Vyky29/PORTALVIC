-- Emanuel Dodson Day Centre NHS/SBS: service start Fri 12 Jun 2026.
-- Correct Summer 25/26 due = Mon/Wed/Fri @ £500 from start date:
--   June: 8 × £500 = £4,000 (was wrongly billed as full June £6,500)
--   July: 14 × £500 = £7,000
--   Total: £11,000 (ledger had been £13,500 from XXPRASHERV1 full-month Jun)
-- Portal invoices (Portal project): INV-P-0128 (Jun) · INV-P-0129 (Jul).

update public.client_payments
set
  amount = 11000,
  client_name = 'Emanuel Dodson',
  parent_name = 'NHS/SBS · Day Centre',
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Services', E'300'' Day Centre, Monday - 11 am to 4 pm\n300'' Day Centre, Wednesday - 11 am to 4 pm\n300'' Day Centre, Friday - 11 am to 4 pm',
    'Paid', 'Funded by NHS',
    'Invoice type', 'NHS (Exempt invoice)',
    'Funding', 'NHS · SBS',
    'Funder', 'NHS · SBS',
    'Funding origin', 'NHS-funded',
    'Payer', 'Local authority / NHS (pays direct)',
    'Payment method', 'NHS invoice (PO)',
    'Term', 'Summer term 2026',
    'Cost', '£500 / session (1:1)',
    'Sessions', 'Mon/Wed/Fri · 11–4 · 8 sess Jun (from 12 Jun) + 14 sess Jul = 22',
    'Weekly', '£1,500 (3 × £500)',
    'VAT', 'Exempt',
    'Payment status', 'Outstanding',
    'June invoice (25/26)', 4000,
    'July invoice (25/26)', 7000,
    'Summer basis', 'Jun £4,000 (8×£500 from 12 Jun) + Jul £7,000 (14×£500) = £11,000',
    'NHS due months', 'Jun £4,000 + Jul £7,000 (from 12 Jun start)',
    'Year billed (25/26)', '£11,000',
    'Year received (25/26)', '£0',
    'Year outstanding', '£11,000',
    'Client Id', '6015644125',
    'Next', 'Summer 25/26 NHS: £11,000 · start 12 Jun · M/W/F 11–4 @ £500'
  )
where client_key = 'emanuel'
  and coalesce(data->>'Term', '') ilike '%summer%';
