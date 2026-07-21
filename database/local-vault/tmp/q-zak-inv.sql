select column_name from information_schema.columns
where table_schema='public' and table_name='portal_parent_invoice_share'
order by ordinal_position;

select id, invoice_number, contact_id, amount_gbp, payment_status, share_status, paid_via,
       stripe_checkout_session_id, stripe_payment_intent_id,
       parent_reported_paid_at, parent_reported_ref, parent_reported_method,
       tide_matched_tx_id, tide_matched_at,
       line_description, reference_text, created_at, paid_at, updated_at
from portal_parent_invoice_share
where contact_id = '42'
order by created_at desc nulls last
limit 30;
