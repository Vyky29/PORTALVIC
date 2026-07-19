-- Ahmed brothers (Adaam / Amaar / Aydaan): LA workbook only had Sunday Multi.
-- Roster booking also includes weekday Aquatic — surface on client_payments.Services.

update public.client_payments
set data = data || jsonb_build_object(
  'Services', '30'' Aquatic Activity (Mon) · 90'' Multi-Activity (Sun)'
)
where client_key in ('adaam-ah', 'adaam_ah')
  or lower(trim(client_name)) in ('adaam ah', 'aadam ah', 'adaam ahmed', 'aadam ahmed');

update public.client_payments
set data = data || jsonb_build_object(
  'Services', '30'' Aquatic Activity (Fri) · 90'' Multi-Activity (Sun)'
)
where client_key in ('amaar-ah', 'amaar_ah')
  or lower(trim(client_name)) in ('amaar ah', 'amaar ahmed');

update public.client_payments
set data = data || jsonb_build_object(
  'Services', '30'' Aquatic Activity (Tue) · 90'' Multi-Activity (Sun)'
)
where client_key in ('aydaan-ah', 'aydaan_ah')
  or lower(trim(client_name)) in ('aydaan ah', 'aydaan ahmed');
