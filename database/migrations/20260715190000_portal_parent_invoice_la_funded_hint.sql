-- Allow LA / local-authority funded invoices as an explicit payment_method_hint.
-- Admin Family Invoices accordion labels these as "LA funded" (not bank transfer / card).

alter table public.portal_parent_invoice_share
  drop constraint if exists portal_parent_invoice_share_method_hint_check;

alter table public.portal_parent_invoice_share
  add constraint portal_parent_invoice_share_method_hint_check
  check (
    payment_method_hint is null
    or payment_method_hint in (
      'bank_transfer',
      'gocardless',
      'payment_link',
      'la_funded',
      'other'
    )
  );

comment on column public.portal_parent_invoice_share.payment_method_hint is
  'Parent payment path: bank_transfer | gocardless | payment_link | la_funded | other';
