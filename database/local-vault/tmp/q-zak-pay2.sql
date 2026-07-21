select column_name from information_schema.columns
where table_schema='public' and table_name='portal_tide_bank_matches'
order by ordinal_position;

select *
from portal_tide_bank_matches
where amount_gbp::numeric between 1600 and 1650
   or amount_gbp::numeric between 690 and 710
   or suggested_invoice_share_id in (
     'aa1ae859-59fe-45e0-aa9d-67f832ee5420'::uuid,
     'df2cef5a-4967-42dc-8f76-1f7ccf0aa758'::uuid
   )
order by created_at desc
limit 20;

select invoice_number, payment_status, paid_via,
       gocardless_payment_id, gocardless_url,
       xero_invoice_id, xero_payment_id, payment_method_hint,
       stripe_checkout_session_id, stripe_payment_intent_id
from portal_parent_invoice_share
where contact_id = '42';
