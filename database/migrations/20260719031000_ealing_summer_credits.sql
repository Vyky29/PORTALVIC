-- Ealing LA: subtract prior-year / absentees credits from Summer term 25/26 outstanding.
-- Idempotent via data ? 'Ealing summer credit (25/26)'.

update public.client_payments
set
  amount = round((amount - 145.76)::numeric, 2),
  data = data
    || jsonb_build_object(
      'Ealing summer credit (25/26)', 145.76,
      'Ealing contact id', '721303',
      'Amount before Ealing credit', amount,
      'Credit note', 'Ealing credit applied against Summer term 25/26 outstanding'
    )
where client_key = 'adaam-ah'
  and sheet = 'LA'
  and coalesce((data->>'Funder'), '') ilike '%ealing%'
  and not (data ? 'Ealing summer credit (25/26)');

update public.client_payments
set
  amount = round((amount - 145.76)::numeric, 2),
  data = data
    || jsonb_build_object(
      'Ealing summer credit (25/26)', 145.76,
      'Ealing contact id', '780469',
      'Amount before Ealing credit', amount,
      'Credit note', 'Ealing credit applied against Summer term 25/26 outstanding'
    )
where client_key = 'aydaan-ah'
  and sheet = 'LA'
  and coalesce((data->>'Funder'), '') ilike '%ealing%'
  and not (data ? 'Ealing summer credit (25/26)');

update public.client_payments
set
  amount = round((amount - 145.76)::numeric, 2),
  data = data
    || jsonb_build_object(
      'Ealing summer credit (25/26)', 145.76,
      'Ealing contact id', '782835',
      'Amount before Ealing credit', amount,
      'Credit note', 'Ealing credit applied against Summer term 25/26 outstanding'
    )
where client_key = 'amaar-ah'
  and sheet = 'LA'
  and coalesce((data->>'Funder'), '') ilike '%ealing%'
  and not (data ? 'Ealing summer credit (25/26)');

update public.client_payments
set
  amount = round((amount - 145.76)::numeric, 2),
  data = data
    || jsonb_build_object(
      'Ealing summer credit (25/26)', 145.76,
      'Ealing contact id', '719915',
      'Amount before Ealing credit', amount,
      'Credit note', 'Ealing credit applied against Summer term 25/26 outstanding'
    )
where client_key = 'steven'
  and sheet = 'LA'
  and coalesce((data->>'Funder'), '') ilike '%ealing%'
  and not (data ? 'Ealing summer credit (25/26)');

update public.client_payments
set
  amount = round((amount - 349.84)::numeric, 2),
  data = data
    || jsonb_build_object(
      'Ealing summer credit (25/26)', 349.84,
      'Ealing contact id', '972515',
      'Amount before Ealing credit', amount,
      'Credit note', 'Ealing credit applied against Summer term 25/26 outstanding'
    )
where client_key = 'samer'
  and sheet = 'LA'
  and coalesce((data->>'Funder'), '') ilike '%ealing%'
  and not (data ? 'Ealing summer credit (25/26)');

update public.client_payments
set
  amount = round((amount - 583.04)::numeric, 2),
  data = data
    || jsonb_build_object(
      'Ealing summer credit (25/26)', 583.04,
      'Ealing contact id', '626186',
      'Amount before Ealing credit', amount,
      'Credit note', 'Ealing credit applied against Summer term 25/26 outstanding'
    )
where client_key = 'amar-rai'
  and sheet = 'LA'
  and coalesce((data->>'Funder'), '') ilike '%ealing%'
  and not (data ? 'Ealing summer credit (25/26)');

update public.client_payments
set
  amount = round((amount - 2011.52)::numeric, 2),
  data = data
    || jsonb_build_object(
      'Ealing summer credit (25/26)', 2011.52,
      'Ealing contact id', '724579',
      'Amount before Ealing credit', amount,
      'Credit note', 'Ealing credit applied against Summer term 25/26 outstanding'
    )
where client_key = 'tinashe'
  and sheet = 'LA'
  and coalesce((data->>'Funder'), '') ilike '%ealing%'
  and not (data ? 'Ealing summer credit (25/26)');
