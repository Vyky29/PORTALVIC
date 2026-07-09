-- Portal-created family invoices (no Xero upload required).
-- Series INV-P-#### is separate from Xero INV-#### numbering.

begin;

create table if not exists public.portal_invoice_number_seq (
  series     text primary key,
  next_n     bigint not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.portal_invoice_number_seq (series, next_n)
values ('INV-P', 1)
on conflict (series) do nothing;

alter table public.portal_invoice_number_seq enable row level security;
revoke all on public.portal_invoice_number_seq from public, anon, authenticated;
grant select, insert, update on public.portal_invoice_number_seq to service_role;

alter table public.portal_parent_invoice_share
  add column if not exists created_via text null;

alter table public.portal_parent_invoice_share
  add column if not exists vat_mode text null;

alter table public.portal_parent_invoice_share
  add column if not exists line_description text null;

alter table public.portal_parent_invoice_share
  add column if not exists quantity numeric(12, 2) null;

alter table public.portal_parent_invoice_share
  add column if not exists unit_price_gbp numeric(12, 4) null;

alter table public.portal_parent_invoice_share
  add column if not exists reference_text text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'portal_parent_invoice_share_vat_mode_check'
  ) then
    alter table public.portal_parent_invoice_share
      add constraint portal_parent_invoice_share_vat_mode_check
      check (vat_mode is null or vat_mode in ('exempt', 'vat_20'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'portal_parent_invoice_share_created_via_check'
  ) then
    alter table public.portal_parent_invoice_share
      add constraint portal_parent_invoice_share_created_via_check
      check (created_via is null or created_via in ('upload', 'portal'));
  end if;
end $$;

comment on column public.portal_parent_invoice_share.created_via is
  'upload = PDF from Xero/office; portal = generated in admin (A path).';
comment on column public.portal_parent_invoice_share.vat_mode is
  'exempt (LA/NHS style) or vat_20 (private funding). Null for legacy uploads.';

-- Atomically allocate next INV-P-#### number (service_role only).
create or replace function public.portal_allocate_invoice_number(p_series text default 'INV-P')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  insert into public.portal_invoice_number_seq (series, next_n)
  values (p_series, 1)
  on conflict (series) do nothing;

  update public.portal_invoice_number_seq
  set next_n = next_n + 1, updated_at = now()
  where series = p_series
  returning next_n - 1 into n;

  if n is null then
    raise exception 'invoice series not found: %', p_series;
  end if;

  return p_series || '-' || lpad(n::text, 4, '0');
end;
$$;

revoke all on function public.portal_allocate_invoice_number(text) from public, anon, authenticated;
grant execute on function public.portal_allocate_invoice_number(text) to service_role;

commit;
