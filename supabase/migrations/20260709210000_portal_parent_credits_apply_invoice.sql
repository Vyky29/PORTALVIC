-- Link family credits when applied against a shared parent invoice.

begin;

alter table public.portal_parent_family_credits
  add column if not exists applied_invoice_share_id uuid null
    references public.portal_parent_invoice_share (id) on delete set null;

create index if not exists portal_parent_family_credits_applied_invoice_idx
  on public.portal_parent_family_credits (applied_invoice_share_id)
  where applied_invoice_share_id is not null;

comment on column public.portal_parent_family_credits.applied_invoice_share_id is
  'Invoice share this credit was applied against (status=applied).';

comment on table public.portal_parent_family_credits is
  'Family-visible credit/refund ledger. Credits can be applied to a shared invoice; refunds stay open until mark_refunded.';

comment on column public.portal_parent_invoice_share.paid_via is
  'How payment was recorded: stripe | admin | bank | credit.';

commit;
