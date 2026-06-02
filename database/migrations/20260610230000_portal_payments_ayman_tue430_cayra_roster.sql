-- Ayman: second Tuesday slot (4:30–5, Lane DE) as a separate PARENTS payment line.
-- Cayra / Bediako: already on PARENTS (Romina); roster CSV + bundle carry Tue 4:30 Lane SE.
-- Summer pro-rata: 7 Tuesdays from 2026-06-02 through 2026-07-14 at £50/session = £350.

begin;

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
  'PARENTS',
  9201,
  'ayman-tue-430',
  'Ayman',
  'Zeyna',
  'Outstanding',
  350.00,
  json_build_object(
    'Services', '30'' AQUATIC ACTIVITY (Tuesday 4:30 · Lane DE)',
    'Term', 'Summer term 2026',
    'Cost', '£50 / session',
    'Sessions', '7 (2 Jun–14 Jul 2026 · Tue)',
    'Summer basis', '7 × £50 (new Tue 4:30 slot from roster go-live)',
    'Payment method', 'Bank transfer',
    'VAT', 'PF / VAT 20%',
    'Payment status', 'Outstanding',
    'Notes', 'Separate from existing Tue 4:00 + Thu row (client_key ayman). Sibling roster: Bediako / Cayra same household (Romina).'
  )::json,
  'portal_migration_20260610230000'
where not exists (
  select 1 from public.client_payments cp where cp.client_key = 'ayman-tue-430'
);

-- Clarify existing Ayman row (Tue 4:00 + Thu) if present — do not change amount.
update public.client_payments cp
set data = (
  cp.data::jsonb || jsonb_build_object(
    'Services', '30'' AQUATIC ACTIVITY (Tuesday 4:00) · 30'' AQUATIC ACTIVITY (Thursday)',
    'Notes', coalesce(cp.data->>'Notes', '') || case when coalesce(cp.data->>'Notes', '') = '' then '' else ' · ' end
      || 'Tue 4:30 slot billed separately (ayman-tue-430).'
  )
)::json
where cp.sheet = 'PARENTS'
  and lower(cp.client_name) = 'ayman'
  and coalesce(cp.client_key, '') <> 'ayman-tue-430'
  and (cp.data->>'Services') ilike '%tuesday%'
  and (cp.data->>'Services') not ilike '%4:30%';

comment on table public.client_payments is
  'Client re-enrolment payments. Ayman Tue 4:30 added 2026-06-02 as ayman-tue-430 (£350 · 7 sessions).';

commit;
