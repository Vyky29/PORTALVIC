-- Timi Day Centre summer 25/26 (from 1 Jun): Mon & Fri 11–1 @ £350 (2:1)
-- + extras £500 (4×1h and 2×2h @ £125/h 1:1, billed £500 as quoted).
-- Day Centre summer window: 2026-06-01 → 2026-07-31 → 18 Mon/Fri sessions.

insert into public.client_payments (
  sheet, row_index, client_key, client_name, parent_name, payment_status, amount, data, source_file
)
select
  'LA',
  1020,
  'timi',
  'Timi',
  'NHS/SBS · Day Centre',
  'Outstanding',
  6800,
  jsonb_build_object(
    'Services', '2h'' 2:1 Day Centre (Mon & Fri) · + 1:1 extras',
    'Paid', 'Funded by NHS',
    'Invoice type', 'NHS (Exempt invoice)',
    'Funding', 'NHS (Exempt invoice)',
    'Funder', 'NHS · SBS',
    'Funding origin', 'NHS-funded',
    'Payer', 'Local authority / NHS (pays direct)',
    'Payment method', 'NHS invoice (PO)',
    'Term', 'SUMMER TERM 25/26',
    'Cost', '£350 / session (2:1) · extras £125 / hour (1:1)',
    'Sessions', 'Mon & Fri · 11–1 · 18 sess (from 1 Jun 2026) + extras',
    'Weekly', '£700 (2 × £350)',
    'VAT', 'Exempt',
    'Invoice', '—',
    'Payment status', 'Outstanding',
    'Summer basis', '18 × £350 = £6,300 + extras £500 = £6,800',
    'Extras', '4×1h + 2×2h @ £125/h 1:1 — billed £500',
    'Year billed (25/26)', '£6,800',
    'Year received (25/26)', '£0',
    'Year outstanding', '£6,800',
    'Next', 'Summer 25/26: £6,800 billed · from 1 Jun · Mon & Fri 11–1 + £500 extras'
  ),
  'manual-portal-2026-07-18-timi-day-centre-summer'
where not exists (
  select 1 from public.client_payments cp
  where cp.client_key = 'timi'
    and (
      coalesce(cp.data->>'Term','') ilike '%SUMMER%25%'
      or coalesce(cp.data->>'Term','') ilike '%Summer term 2026%'
    )
);
