-- Re-enrolment funding / status corrections (office vs parent form).
-- Aadam Ahmed · Ealing LA (office renews)
-- Aboodi Patel · H&F LA (office renews)
-- Saaib Abdullah · H&F LA (office renews)
-- Kirushy Saravanapavan · cancelled June 2026 (not in class)
-- Yusuf Ahmed · Using Funds from LA (parents pay)

-- Contacts: funding labels
update public.portal_parent_contacts
set
  funding_label = 'Local authority · Ealing',
  payment_method_label = coalesce(nullif(trim(payment_method_label), ''), 'LA invoice (Care in Finance)'),
  updated_at = now()
where contact_id = '124'
  and child_display ilike 'Aadam%';

update public.portal_parent_contacts
set
  funding_label = 'Local authority · H&F',
  payment_method_label = coalesce(nullif(trim(payment_method_label), ''), 'LA invoice (BACS)'),
  updated_at = now()
where contact_id = '155'
  and child_display ilike 'Aboodi%';

update public.portal_parent_contacts
set
  funding_label = 'Local authority · H&F',
  payment_method_label = coalesce(nullif(trim(payment_method_label), ''), 'LA invoice (BACS)'),
  updated_at = now()
where contact_id = 'gap-saaib-abdullah'
  and child_display ilike 'Saaib%';

update public.portal_parent_contacts
set
  funding_label = 'Using Funds from LA',
  payment_method_label = coalesce(nullif(trim(payment_method_label), ''), 'Parent · Direct Payments (LA money)'),
  updated_at = now()
where contact_id = '13'
  and child_display ilike 'Yusuf Ahmed%';

-- Kirushy: left / cancelled June 2026
update public.portal_parent_contacts
set
  in_class = false,
  updated_at = now()
where contact_id = '388'
  and child_display ilike 'Kirushy%';

update public.portal_participants
set
  in_class = false,
  updated_at = now()
where contact_id = '388';

-- Align LA payment sheet display names (Saaib stays H&F)
update public.client_payments
set
  client_name = 'Aadam Ahmed',
  data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
    'Funding', 'Local authority · Ealing',
    'Funder', 'Ealing',
    'Funding origin', 'LA-funded',
    'Payer', 'Local authority / NHS (pays direct)',
    'Payment method', 'LA invoice (Care in Finance)'
  )
where client_key = 'adaam-ah';

update public.client_payments
set
  client_name = 'Aboodi Patel',
  data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
    'Funding', 'Local authority · H&F',
    'Funder', 'H&F (Hammersmith & Fulham)',
    'Funding origin', 'LA-funded',
    'Payer', 'Local authority / NHS (pays direct)',
    'Payment method', 'LA invoice (BACS)'
  )
where client_key = 'abodi-patel';

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
