-- Xero Items cache + Portal service → product mapping (VAT vs exempt).

begin;

create table if not exists public.portal_xero_items (
  item_code           text primary key,
  item_id             text null,
  name                text not null,
  description         text null,
  sales_unit_price    numeric(12, 4) null,
  sales_tax_type      text null,
  is_sold             boolean not null default true,
  synced_at           timestamptz not null default now()
);

create index if not exists portal_xero_items_name_idx
  on public.portal_xero_items (lower(name));

comment on table public.portal_xero_items is
  'Cache of Xero inventory Items (synced from API).';

create table if not exists public.portal_xero_product_map (
  service_key           text primary key,
  label                 text not null,
  xero_item_code_vat    text null references public.portal_xero_items (item_code) on delete set null,
  xero_item_code_exempt text null references public.portal_xero_items (item_code) on delete set null,
  sort_order            integer not null default 0,
  notes                 text null,
  updated_at            timestamptz not null default now()
);

create index if not exists portal_xero_product_map_sort_idx
  on public.portal_xero_product_map (sort_order, service_key);

comment on table public.portal_xero_product_map is
  'Maps Portal programme keys (e.g. AQUATIC_30) to Xero Item codes — VAT taxable vs VAT exempt.';

alter table public.portal_parent_invoice_share
  add column if not exists line_items jsonb not null default '[]'::jsonb;

comment on column public.portal_parent_invoice_share.line_items is
  'Invoice line rows [{service_key,description,quantity,unit_price_gbp,amount_gbp,xero_item_code}] for re-enrol / Xero.';

-- Canonical programme keys (admin links Xero codes after sync).
insert into public.portal_xero_product_map (service_key, label, sort_order)
values
  ('AQUATIC_30', 'Aquatic Activity 30''', 10),
  ('AQUATIC_60', 'Aquatic Activity 60''', 11),
  ('CLIMBING_60', 'Climbing Activity 60''', 20),
  ('CLIMBING_90', 'Climbing Activity 90''', 21),
  ('MULTI_90', 'Multi-Activity 90''', 30),
  ('PHYSICAL_60', 'Physical Activity 60''', 40),
  ('BESPOKE_60', 'Bespoke Programme 60''', 50),
  ('COUNSELLING_45', 'Counselling 45''', 60),
  ('ADMIN_FEE', 'Admin fee (own arrangement)', 90),
  ('GC_FEE', 'GoCardless instalment fee', 91)
on conflict (service_key) do nothing;

alter table public.portal_xero_items enable row level security;
alter table public.portal_xero_product_map enable row level security;
revoke all on public.portal_xero_items from public, anon, authenticated;
revoke all on public.portal_xero_product_map from public, anon, authenticated;
grant select, insert, update, delete on public.portal_xero_items to service_role;
grant select, insert, update, delete on public.portal_xero_product_map to service_role;

commit;
