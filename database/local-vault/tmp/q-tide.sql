select column_name from information_schema.columns
where table_schema='public' and table_name='portal_tide_bank_matches'
order by ordinal_position;

select count(*) as n from portal_tide_bank_matches;

select id, tide_tx_id, amount_gbp, status, suggested_invoice_share_id,
       confirmed_invoice_share_id, created_at,
       left(coalesce(raw_reference, reference_text, description, ''), 120) as refish
from portal_tide_bank_matches
order by created_at desc
limit 15;
