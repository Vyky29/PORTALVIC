-- GoCardless API: mandate store + payment ids on invoice share.

begin;

create table if not exists public.portal_parent_gocardless_mandates (
  contact_id text primary key,
  parent_person_id uuid null,
  gocardless_customer_id text null,
  gocardless_mandate_id text null,
  mandate_status text not null default 'pending',
  billing_request_id text null,
  billing_request_flow_id text null,
  authorisation_url text null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_parent_gocardless_mandates_mandate_idx
  on public.portal_parent_gocardless_mandates (gocardless_mandate_id)
  where gocardless_mandate_id is not null;

create index if not exists portal_parent_gocardless_mandates_parent_idx
  on public.portal_parent_gocardless_mandates (parent_person_id)
  where parent_person_id is not null;

alter table public.portal_parent_gocardless_mandates enable row level security;

drop policy if exists portal_parent_gocardless_mandates_service on public.portal_parent_gocardless_mandates;
create policy portal_parent_gocardless_mandates_service
  on public.portal_parent_gocardless_mandates
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.portal_parent_gocardless_mandates is
  'GoCardless Direct Payment mandate per participant contact (API integration).';

alter table public.portal_parent_invoice_share
  add column if not exists gocardless_payment_id text null,
  add column if not exists gocardless_mandate_id text null;

create index if not exists portal_parent_invoice_share_gc_payment_idx
  on public.portal_parent_invoice_share (gocardless_payment_id)
  where gocardless_payment_id is not null;

comment on column public.portal_parent_invoice_share.gocardless_payment_id is
  'GoCardless payment id (PM…) created against the family mandate.';
comment on column public.portal_parent_invoice_share.gocardless_mandate_id is
  'GoCardless mandate id (MD…) used for this invoice payment.';
comment on column public.portal_parent_invoice_share.gocardless_url is
  'GoCardless hosted authorisation / payment URL (API flow or office paste).';
comment on column public.portal_parent_invoice_share.paid_via is
  'How payment was recorded: stripe | gocardless | admin | bank | credit.';

commit;
