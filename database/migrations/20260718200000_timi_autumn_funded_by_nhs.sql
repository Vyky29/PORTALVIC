-- Timi Day Centre is NHS-funded (not LA). Correct Paid / Invoice type chips.

update public.client_payments
set
  parent_name = 'NHS/SBS · Day Centre',
  data = data
    || jsonb_build_object(
      'Paid', 'Funded by NHS',
      'Invoice type', 'NHS (Exempt invoice)',
      'Funding', 'NHS (Exempt invoice)',
      'Funder', 'NHS · SBS',
      'Funding origin', 'NHS-funded',
      'Payer', 'Local authority / NHS (pays direct)',
      'Payment method', 'NHS invoice (PO)'
    ),
  updated_at = now()
where client_key = 'timi'
  and coalesce(data->>'Term', '') ilike '%AUTUMN%26%';
