-- Ealing LA: Yousef Alsamarai still owes £143 (no longer an active client).
-- Contact ID 790419 · keep on Funded-by-LA Outstanding list.
-- Idempotent on client_key + sheet + Ealing contact id.

insert into public.client_payments (
  sheet,
  row_index,
  client_key,
  client_name,
  parent_name,
  payment_status,
  amount,
  data,
  source_file
)
select
  'LA',
  coalesce((select max(row_index) + 1 from public.client_payments), 1),
  'yousef-al',
  'Yousef Alsamarai',
  'Ealing · former client',
  'Outstanding',
  143.00,
  jsonb_build_object(
    'Services', 'Prior balance (no longer attending)',
    'Funding', 'Local authority · Ealing',
    'Funder', 'Ealing',
    'Funding origin', 'LA-funded',
    'Payer', 'Local authority / NHS (pays direct)',
    'Payment method', 'Direct payment (CWD remittance)',
    'Term', 'Summer term 2026',
    'Invoice', '—',
    'VAT', 'Exempt',
    'Payment status', 'Outstanding',
    'Paid', 'Funded by LA',
    'Invoice type', 'Local Authority (Exempt invoice)',
    'Ealing contact id', '790419',
    'Credit note', 'Former client — £143 still owed (spreadsheet green box)',
    'Former client', true,
    'Year outstanding', '£143'
  ),
  'office_manual_ealing_yousef_alsamarai_2026-07-28'
where not exists (
  select 1
  from public.client_payments cp
  where cp.client_key = 'yousef-al'
    and cp.sheet = 'LA'
    and coalesce(cp.data->>'Ealing contact id', '') = '790419'
);
