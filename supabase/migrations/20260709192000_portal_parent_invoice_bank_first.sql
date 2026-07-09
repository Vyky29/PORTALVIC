-- Invoice payments Phase 2: bank-first (Tide) + optional GC/Payment Link + parent "I've paid".

begin;

-- Expand payment_status to allow pending_confirmation (drop/recreate check).
alter table public.portal_parent_invoice_share
  drop constraint if exists portal_parent_invoice_share_payment_status_check;

alter table public.portal_parent_invoice_share
  add constraint portal_parent_invoice_share_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'partial', 'void', 'pending_confirmation'));

alter table public.portal_parent_invoice_share
  add column if not exists payment_method_hint text null,
  add column if not exists gocardless_url text null,
  add column if not exists payment_link_url text null,
  add column if not exists payment_link_surcharge_note text null,
  add column if not exists parent_reported_paid_at timestamptz null,
  add column if not exists parent_reported_ref text null,
  add column if not exists parent_reported_method text null,
  add column if not exists parent_reported_notes text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'portal_parent_invoice_share_method_hint_check'
  ) then
    alter table public.portal_parent_invoice_share
      add constraint portal_parent_invoice_share_method_hint_check
      check (
        payment_method_hint is null
        or payment_method_hint in ('bank_transfer', 'gocardless', 'payment_link', 'other')
      );
  end if;
end $$;

create index if not exists portal_parent_invoice_share_pending_idx
  on public.portal_parent_invoice_share (payment_status, parent_reported_paid_at desc nulls last)
  where payment_status = 'pending_confirmation';

comment on column public.portal_parent_invoice_share.payment_method_hint is
  'Preferred channel hint for parents: bank_transfer | gocardless | payment_link | other.';
comment on column public.portal_parent_invoice_share.gocardless_url is
  'Optional GoCardless payment/mandate URL pasted by office (no API).';
comment on column public.portal_parent_invoice_share.payment_link_url is
  'Optional Stripe Payment Link — rare; surcharge note may apply.';
comment on column public.portal_parent_invoice_share.parent_reported_paid_at is
  'When parent tapped I paid; office must confirm before status becomes paid.';

comment on table public.portal_parent_invoice_share is
  'Client invoice PDFs for the family portal. Primary pay path: Tide bank transfer; optional GoCardless/Payment Link URLs; Stripe Checkout deferred.';

commit;
