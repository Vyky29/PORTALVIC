-- Tide CSV bank-match queue for Family invoices (admin confirm → paid).

begin;

create table if not exists public.portal_tide_bank_matches (
  id                          uuid primary key default gen_random_uuid(),
  tide_tx_id                  text not null,
  booking_date                date null,
  amount_gbp                  numeric(12, 2) not null,
  reference_raw               text null,
  suggested_invoice_share_id  uuid null references public.portal_parent_invoice_share (id) on delete set null,
  score                       text not null default 'none'
    check (score in ('strong', 'medium', 'none')),
  status                      text not null default 'suggested'
    check (status in ('suggested', 'confirmed', 'ignored')),
  confirmed_at                timestamptz null,
  confirmed_by                text null,
  upload_batch_id             text null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (tide_tx_id)
);

create index if not exists portal_tide_bank_matches_status_idx
  on public.portal_tide_bank_matches (status, score, booking_date desc nulls last);

create index if not exists portal_tide_bank_matches_invoice_idx
  on public.portal_tide_bank_matches (suggested_invoice_share_id)
  where suggested_invoice_share_id is not null;

comment on table public.portal_tide_bank_matches is
  'Tide bank CSV rows scored against INV-P; admin confirms to mark invoice paid.';

alter table public.portal_parent_invoice_share
  add column if not exists tide_matched_tx_id text null;

alter table public.portal_parent_invoice_share
  add column if not exists tide_matched_at timestamptz null;

comment on column public.portal_parent_invoice_share.tide_matched_tx_id is
  'Tide transaction id (or hash) when paid via Tide CSV match.';
comment on column public.portal_parent_invoice_share.tide_matched_at is
  'When admin confirmed a Tide CSV match for this invoice.';

alter table public.portal_tide_bank_matches enable row level security;
revoke all on public.portal_tide_bank_matches from public, anon, authenticated;
grant select, insert, update, delete on public.portal_tide_bank_matches to service_role;

commit;
