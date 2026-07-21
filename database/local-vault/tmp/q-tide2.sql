select count(*)::int as n from portal_tide_bank_matches;

select id, tide_tx_id, booking_date, amount_gbp, score, status,
       suggested_invoice_share_id, left(coalesce(reference_raw,''), 140) as reference_raw,
       upload_batch_id, created_at
from portal_tide_bank_matches
where amount_gbp between 1600 and 1650
   or amount_gbp between 690 and 710
   or suggested_invoice_share_id = 'aa1ae859-59fe-45e0-aa9d-67f832ee5420'
   or coalesce(reference_raw,'') ilike '%0074%'
   or coalesce(reference_raw,'') ilike '%catarina%'
   or coalesce(reference_raw,'') ilike '%zak%'
   or coalesce(reference_raw,'') ilike '%silva%'
order by created_at desc
limit 25;

select id, tide_tx_id, booking_date, amount_gbp, score, status,
       left(coalesce(reference_raw,''), 100) as reference_raw, created_at
from portal_tide_bank_matches
order by created_at desc
limit 10;
