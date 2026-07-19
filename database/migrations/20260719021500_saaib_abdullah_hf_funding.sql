-- Saaib Abdullah is H&F (not Ealing). Revert mistaken Ealing label.
update public.portal_parent_contacts
set
  funding_label = 'Local authority · H&F',
  payment_method_label = 'LA invoice (BACS)',
  updated_at = now()
where contact_id = 'gap-saaib-abdullah';

update public.client_payments
set
  client_name = 'Saaib Abdullah',
  parent_name = 'H&F · Sabrosa',
  data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
    'Funding', 'Local authority · H&F',
    'Funder', 'H&F (Hammersmith & Fulham)',
    'Funding origin', 'LA-funded',
    'Payer', 'Local authority / NHS (pays direct)',
    'Payment method', 'LA invoice (BACS)'
  )
where client_key = 'saiib';
