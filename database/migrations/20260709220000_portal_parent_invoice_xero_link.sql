-- Duplicate of supabase/migrations/20260709220000_portal_parent_invoice_xero_link.sql

begin;

alter table public.portal_parent_invoice_share
  add column if not exists xero_invoice_id text null;

alter table public.portal_parent_invoice_share
  add column if not exists xero_payment_id text null;

alter table public.portal_parent_invoice_share
  add column if not exists xero_synced_at timestamptz null;

create index if not exists portal_parent_invoice_share_xero_idx
  on public.portal_parent_invoice_share (xero_invoice_id)
  where xero_invoice_id is not null;

comment on column public.portal_parent_invoice_share.xero_invoice_id is
  'Xero InvoiceID (GUID). When set, portal payment events can post a Payment in Xero.';
comment on column public.portal_parent_invoice_share.xero_payment_id is
  'Xero PaymentID after successful write-back.';
comment on column public.portal_parent_invoice_share.xero_synced_at is
  'When payment was last written to Xero.';

commit;
