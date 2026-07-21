-- any tide matches suggesting Zakariya / 1625 / Catarina
select id, tide_tx_id, amount_gbp, counterparty, reference, matched_status,
       suggested_invoice_share_id, confirmed_invoice_share_id, created_at
from portal_tide_bank_matches
where amount_gbp between 1600 and 1650
   or amount_gbp between 690 and 710
   or coalesce(counterparty,'') ilike '%catarina%'
   or coalesce(counterparty,'') ilike '%silva%'
   or coalesce(counterparty,'') ilike '%zakariya%'
   or coalesce(reference,'') ilike '%0074%'
   or coalesce(reference,'') ilike '%zak%'
   or suggested_invoice_share_id in (
     'aa1ae859-59fe-45e0-aa9d-67f832ee5420',
     'df2cef5a-4967-42dc-8f76-1f7ccf0aa758'
   )
order by created_at desc
limit 30;

-- gocardless / other paid flags on her shares
select invoice_number, payment_status, paid_via, gocardless_payment_id, gocardless_url,
       xero_invoice_id, xero_payment_id, payment_method_hint
from portal_parent_invoice_share
where contact_id = '42';
