-- Stash of GoCardless mandates from dashboard export (linked + unlinked).

begin;

create table if not exists public.portal_gocardless_mandate_stash (
  gocardless_mandate_id text primary key,
  gocardless_customer_id text null,
  customer_email text null,
  customer_email_norm text null,
  customer_given_name text null,
  customer_family_name text null,
  customer_display text null,
  link_status text not null default 'unlinked'
    check (link_status in ('linked', 'unlinked', 'former', 'review')),
  linked_contact_id text null,
  notes text null,
  source_export text null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_gocardless_mandate_stash_email_idx
  on public.portal_gocardless_mandate_stash (customer_email_norm)
  where customer_email_norm is not null;

create index if not exists portal_gocardless_mandate_stash_status_idx
  on public.portal_gocardless_mandate_stash (link_status);

alter table public.portal_gocardless_mandate_stash enable row level security;

drop policy if exists portal_gocardless_mandate_stash_service on public.portal_gocardless_mandate_stash;
create policy portal_gocardless_mandate_stash_service
  on public.portal_gocardless_mandate_stash
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.portal_gocardless_mandate_stash is
  'All GoCardless mandates from dashboard export. Unlinked kept for returners / email mismatches; linked rows mirror portal_parent_gocardless_mandates.';

commit;
