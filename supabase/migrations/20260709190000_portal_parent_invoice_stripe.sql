-- Stripe fields for parent invoice Checkout (Phase 2).

begin;

alter table public.portal_parent_invoice_share
  add column if not exists stripe_checkout_session_id text null,
  add column if not exists stripe_payment_intent_id text null,
  add column if not exists paid_at timestamptz null,
  add column if not exists paid_via text null;

create index if not exists portal_parent_invoice_share_stripe_session_idx
  on public.portal_parent_invoice_share (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

comment on column public.portal_parent_invoice_share.stripe_checkout_session_id is
  'Latest Stripe Checkout Session id for this invoice share.';
comment on column public.portal_parent_invoice_share.paid_via is
  'How payment was recorded: stripe | admin | bank.';

comment on table public.portal_parent_invoice_share is
  'Client invoice PDFs for the family portal. Parents can pay unpaid invoices via Stripe Checkout when configured.';

commit;
