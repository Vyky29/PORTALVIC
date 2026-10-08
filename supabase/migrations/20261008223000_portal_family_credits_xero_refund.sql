-- Xero credit note + parent notify tracking for family refunds.

alter table public.portal_parent_family_credits
  add column if not exists linked_invoice_number text null,
  add column if not exists xero_credit_note_id text null,
  add column if not exists xero_credit_note_number text null,
  add column if not exists refund_notify_sent_at timestamptz null;

comment on column public.portal_parent_family_credits.linked_invoice_number is
  'Portal INV-P the refund relates to (for Xero CN allocation).';
comment on column public.portal_parent_family_credits.xero_credit_note_id is
  'Xero CreditNoteID after mark_refunded settlement.';
comment on column public.portal_parent_family_credits.refund_notify_sent_at is
  'When parent WhatsApp/email for payout was sent (optional on mark_refunded).';
