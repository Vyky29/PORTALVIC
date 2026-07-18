-- Timi Day Centre autumn 2026/27 (Mon & Fri 11–1 @ £350/session from 1 Sep).
-- Autumn sessions Mon+Fri = 31 → £10850. Annual Mon+Fri = 86 → £30100.

insert into public.client_payments (
  sheet, row_index, client_key, client_name, parent_name, payment_status, amount, data, source_file
)
select
  'LA',
  1019,
  'timi',
  'Timi',
  'Afolake · Day Centre',
  'Outstanding',
  10850,
  '{"Services":"2h'' 2:1 Day Centre (Mon & Fri)","Paid":"Funded by LA","Invoice type":"Local Authority (Exempt invoice)","Funding":"Local Authority (Exempt invoice)","Funder":"Local Authority (Exempt invoice)","Funding origin":"LA-funded","Payer":"Local authority / NHS (pays direct)","Payment method":"LA invoice (BACS)","Term":"AUTUMN TERM 26/27","Cost":"£350 / session","Sessions":"Mon & Fri · 11–1 · 31 sess (from 1 Sep 2026)","Weekly":"£700 (2 × £350)","VAT":"Exempt","Invoice":"—","Payment status":"Outstanding","Autumn basis":"31 sessions × £350 = £10,850","Year billed (26/27)":"£30,100","Year outstanding":"£30,100","Next":"Autumn 26/27: £10,850 billed · from 1 Sep · Mon & Fri 11–1"}'::jsonb,
  'manual-portal-2026-07-18-timi-day-centre-autumn'
where not exists (
  select 1 from public.client_payments cp
  where cp.client_key = 'timi'
    and coalesce(cp.data->>'Term','') ilike '%AUTUMN%26%'
);
