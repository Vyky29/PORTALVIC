select s.invoice_number, s.contact_id, s.amount_gbp, s.amount_paid_gbp,
       s.payment_status, s.share_status, s.billing_term, s.created_at::text,
       s.line_items::text as line_items
from portal_parent_invoice_share s
where s.contact_id in ('39','40')
order by s.contact_id, s.billing_term;
