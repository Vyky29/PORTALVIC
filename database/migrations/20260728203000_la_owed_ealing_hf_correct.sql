-- Correct LA outstanding to office list (Ealing green boxes + H&F).
-- Ealing: Yousef 143 · Amar-Rai 829 · Steven 531 · Tinashe 1603 · Samer 540.96
--         Amaar/Aydaan/Adaam 1158.16 each
-- H&F: Adam P 3150 · Simon 650 · Yassir 500 · Faris 650 · Saaib 100 (= £5,050)
--      Saaib crash £100 is H&F LA who pays; pot share = Day Centre V&R (not ASW)

-- ========== Ealing ==========
update public.client_payments
set
  amount = 143.00,
  client_name = 'Yousef Alsamarai',
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Office owed (LA)', 143,
    'Office owed note', 'Ealing green box · former client',
    'Payment status', 'Outstanding'
  )
where client_key = 'yousef-al' and sheet = 'LA';

update public.client_payments
set
  amount = 829.00,
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Office owed (LA)', 829,
    'Office owed note', 'Ealing green box Amar-Rai',
    'Payment status', 'Outstanding',
    'Amount before office owed fix', amount
  )
where client_key = 'amar-rai' and sheet = 'LA' and payment_status ilike '%out%';

update public.client_payments
set
  amount = 531.00,
  client_name = 'Steven Cesare',
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Office owed (LA)', 531,
    'Office owed note', 'Ealing green box Steven Cesare',
    'Payment status', 'Outstanding',
    'Amount before office owed fix', amount
  )
where client_key = 'steven' and sheet = 'LA' and payment_status ilike '%out%';

update public.client_payments
set
  amount = 1603.00,
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Office owed (LA)', 1603,
    'Office owed note', 'Ealing green box Tinashe Nekati',
    'Payment status', 'Outstanding',
    'Amount before office owed fix', amount
  )
where client_key = 'tinashe' and sheet = 'LA' and payment_status ilike '%out%';

update public.client_payments
set
  amount = 540.96,
  client_name = 'Samer Bakhiet',
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Office owed (LA)', 540.96,
    'Office owed note', 'Ealing green box Samer Bakhiet',
    'Payment status', 'Outstanding',
    'Amount before office owed fix', amount
  )
where client_key = 'samer' and sheet = 'LA' and payment_status ilike '%out%';

update public.client_payments
set
  amount = 1158.16,
  client_name = 'Amaar Ahmed',
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Office owed (LA)', 1158.16,
    'Office owed note', 'Ealing green box Amaar Ahmed',
    'Payment status', 'Outstanding',
    'Amount before office owed fix', amount
  )
where client_key = 'amaar-ah' and sheet = 'LA' and payment_status ilike '%out%';

update public.client_payments
set
  amount = 1158.16,
  client_name = 'Aydaan Ahmed',
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Office owed (LA)', 1158.16,
    'Office owed note', 'Ealing green box Aydaan Ahmed',
    'Payment status', 'Outstanding',
    'Amount before office owed fix', amount
  )
where client_key = 'aydaan-ah' and sheet = 'LA' and payment_status ilike '%out%';

update public.client_payments
set
  amount = 1158.16,
  client_name = 'Adaam Ahmed',
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Office owed (LA)', 1158.16,
    'Office owed note', 'Ealing green box Adaam Ahmed',
    'Payment status', 'Outstanding',
    'Amount before office owed fix', amount
  )
where client_key = 'adaam-ah' and sheet = 'LA' and payment_status ilike '%out%';

-- ========== H&F ==========
-- Adam P £3,150 was on PARENTS / Private → move to LA H&F
update public.client_payments
set
  sheet = 'LA',
  amount = 3150.00,
  payment_status = 'Outstanding',
  parent_name = coalesce(nullif(parent_name, ''), 'H&F'),
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Funder', 'H&F (Hammersmith & Fulham)',
    'Funding', 'Local authority · H&F',
    'Funding origin', 'LA-funded',
    'Paid', 'Funded by LA',
    'Invoice type', 'Local Authority (Exempt invoice)',
    'Payer', 'Local authority / NHS (pays direct)',
    'Payment status', 'Outstanding',
    'Office owed (LA)', 3150,
    'Office owed note', 'H&F LA · Adam P £1050+£1350+£750 (excl. £300 Day Centre summer)'
  )
where client_key = 'adam-p'
  and amount = 3150
  and payment_status ilike '%out%';

update public.client_payments
set
  amount = 650.00,
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Funder', 'H&F (Hammersmith & Fulham)',
    'Paid', 'Funded by LA',
    'Office owed (LA)', 650,
    'Office owed note', 'H&F LA Simon',
    'Payment status', 'Outstanding'
  )
where client_key = 'simon' and sheet = 'LA' and payment_status ilike '%out%';

update public.client_payments
set
  amount = 500.00,
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Funder', 'H&F (Hammersmith & Fulham)',
    'Paid', 'Funded by LA',
    'Office owed (LA)', 500,
    'Office owed note', 'H&F LA Yassir £150+£200+£150',
    'Payment status', 'Outstanding'
  )
where client_key = 'yassir' and sheet = 'LA' and payment_status ilike '%out%';

update public.client_payments
set
  amount = 650.00,
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Funder', 'H&F (Hammersmith & Fulham)',
    'Paid', 'Funded by LA',
    'Office owed (LA)', 650,
    'Office owed note', 'H&F LA Faris',
    'Payment status', 'Outstanding'
  )
where client_key = 'faris' and sheet = 'LA' and payment_status ilike '%out%';

-- Saaib £100 H&F LA (crash julio); pot = Day Centre V&R
update public.client_payments
set
  amount = 100.00,
  payment_status = 'Outstanding',
  data = coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
    'Funder', 'H&F (Hammersmith & Fulham)',
    'Funding', 'Local authority · H&F',
    'Funding origin', 'LA-funded',
    'Paid', 'Funded by LA',
    'Invoice type', 'Local Authority (Exempt invoice)',
    'Pot', 'Day Centre V&R',
    'Office owed (LA)', 100,
    'Office owed note', 'H&F LA crash julio £100 — se reparte pot Day Centre Victor+Raul (no ASW)',
    'Payment status', 'Outstanding',
    'Amount before office owed fix', amount
  )
where client_key = 'saiib' and sheet = 'LA' and payment_status ilike '%out%';
