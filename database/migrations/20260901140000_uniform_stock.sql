-- Uniform stock control (Portal): catalog, live levels, staff ledger, immutable movements.
-- Opening 130 / Stock out 17 / Current 113 (seeded from office sheet).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table if not exists public.uniform_items (
  id uuid primary key default gen_random_uuid(),
  sku_code text not null unique,
  name text not null,
  category text not null check (category in ('staff', 'managers')),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Live qty by size
-- ---------------------------------------------------------------------------
create table if not exists public.uniform_stock_levels (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.uniform_items (id) on delete cascade,
  size text not null check (size in ('S', 'M', 'L', 'XL', 'XXL')),
  opening_qty int not null default 0 check (opening_qty >= 0),
  current_qty int not null default 0 check (current_qty >= 0),
  updated_at timestamptz not null default now(),
  unique (item_id, size)
);

create index if not exists uniform_stock_levels_item_idx
  on public.uniform_stock_levels (item_id);

-- ---------------------------------------------------------------------------
-- Per-employee ledger
-- ---------------------------------------------------------------------------
create table if not exists public.uniform_issues (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles (id) on delete cascade,
  item_id uuid not null references public.uniform_items (id) on delete restrict,
  size text not null check (size in ('S', 'M', 'L', 'XL', 'XXL')),
  qty int not null check (qty > 0),
  issue_type text not null check (
    issue_type in ('initial', 'replacement', 'size_change', 'correction')
  ),
  issued_at timestamptz not null default now(),
  reason text null,
  charge_applies boolean not null default false,
  charge_gbp numeric(8, 2) not null default 0 check (charge_gbp >= 0),
  staff_ack_name text null,
  staff_ack_at timestamptz null,
  issuer_staff_id uuid null references public.staff_profiles (id) on delete set null,
  issuer_ack_name text null,
  issuer_ack_at timestamptz null,
  status text not null default 'issued' check (
    status in ('issued', 'returned_restock', 'returned_scrap')
  ),
  returned_at timestamptz null,
  return_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists uniform_issues_staff_idx
  on public.uniform_issues (staff_profile_id, issued_at desc);
create index if not exists uniform_issues_item_size_idx
  on public.uniform_issues (item_id, size);
create index if not exists uniform_issues_status_idx
  on public.uniform_issues (status);

-- ---------------------------------------------------------------------------
-- Immutable stock audit
-- ---------------------------------------------------------------------------
create table if not exists public.uniform_stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.uniform_items (id) on delete restrict,
  size text not null check (size in ('S', 'M', 'L', 'XL', 'XXL')),
  delta int not null,
  reason text not null check (
    reason in ('issue', 'return_restock', 'return_scrap', 'stock_in', 'adjust', 'pre_portal_stock_out')
  ),
  issue_id uuid null references public.uniform_issues (id) on delete set null,
  actor_user_id uuid null,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists uniform_stock_movements_item_idx
  on public.uniform_stock_movements (item_id, size, created_at desc);
create index if not exists uniform_stock_movements_issue_idx
  on public.uniform_stock_movements (issue_id);

-- ---------------------------------------------------------------------------
-- RLS: staff read own issues; catalog/levels readable by authenticated staff;
-- all writes via Edge Functions (service role).
-- ---------------------------------------------------------------------------
alter table public.uniform_items enable row level security;
alter table public.uniform_stock_levels enable row level security;
alter table public.uniform_issues enable row level security;
alter table public.uniform_stock_movements enable row level security;

drop policy if exists uniform_items_authenticated_select on public.uniform_items;
create policy uniform_items_authenticated_select
  on public.uniform_items
  for select
  to authenticated
  using (true);

drop policy if exists uniform_stock_levels_authenticated_select on public.uniform_stock_levels;
create policy uniform_stock_levels_authenticated_select
  on public.uniform_stock_levels
  for select
  to authenticated
  using (true);

drop policy if exists uniform_issues_own_select on public.uniform_issues;
create policy uniform_issues_own_select
  on public.uniform_issues
  for select
  to authenticated
  using (
    staff_profile_id = (select auth.uid())
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and sp.is_active is not false
        and (
          lower(coalesce(sp.app_role, '')) in ('admin', 'ceo')
          or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin', 'team_leader', 'team leader', 'tl')
        )
    )
  );

drop policy if exists uniform_stock_movements_admin_select on public.uniform_stock_movements;
create policy uniform_stock_movements_admin_select
  on public.uniform_stock_movements
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and sp.is_active is not false
        and (
          lower(coalesce(sp.app_role, '')) in ('admin', 'ceo')
          or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin', 'team_leader', 'team leader', 'tl')
        )
    )
  );

grant select on public.uniform_items to authenticated;
grant select on public.uniform_stock_levels to authenticated;
grant select on public.uniform_issues to authenticated;
grant select on public.uniform_stock_movements to authenticated;

grant all on public.uniform_items to service_role;
grant all on public.uniform_stock_levels to service_role;
grant all on public.uniform_issues to service_role;
grant all on public.uniform_stock_movements to service_role;

-- ---------------------------------------------------------------------------
-- Seed catalog + levels + historical stock-out movements (no staff links)
-- ---------------------------------------------------------------------------
insert into public.uniform_items (sku_code, name, category, sort_order)
values
  ('STAFF_GREY_TSHIRT', 'Grey Mixed Cotton T-Shirts', 'staff', 1),
  ('STAFF_GREY_SWEAT', 'Grey Knitted Sweatshirts', 'staff', 2),
  ('MGR_BEIGE_POLO', 'Beige 100% Cotton Polo Shirts', 'managers', 3),
  ('MGR_GREY_POLO', 'Grey Mix Cotton Polo Shirts', 'managers', 4)
on conflict (sku_code) do update
set
  name = excluded.name,
  category = excluded.category,
  sort_order = excluded.sort_order,
  active = true;

-- Helper: upsert stock level + optional pre_portal_stock_out movement
do $$
declare
  v_item uuid;
  r record;
begin
  -- (sku, size, opening, stock_out, current)
  for r in
    select * from (values
      ('STAFF_GREY_TSHIRT', 'S', 5, 1, 4),
      ('STAFF_GREY_TSHIRT', 'M', 5, 3, 2),
      ('STAFF_GREY_TSHIRT', 'L', 15, 1, 14),
      ('STAFF_GREY_TSHIRT', 'XL', 15, 2, 13),
      ('STAFF_GREY_TSHIRT', 'XXL', 5, 1, 4),
      ('STAFF_GREY_SWEAT', 'S', 5, 0, 5),
      ('STAFF_GREY_SWEAT', 'M', 5, 1, 4),
      ('STAFF_GREY_SWEAT', 'L', 15, 3, 12),
      ('STAFF_GREY_SWEAT', 'XL', 15, 0, 15),
      ('STAFF_GREY_SWEAT', 'XXL', 5, 0, 5),
      ('MGR_BEIGE_POLO', 'S', 0, 0, 0),
      ('MGR_BEIGE_POLO', 'M', 5, 0, 5),
      ('MGR_BEIGE_POLO', 'L', 5, 2, 3),
      ('MGR_BEIGE_POLO', 'XL', 10, 0, 10),
      ('MGR_BEIGE_POLO', 'XXL', 0, 0, 0),
      ('MGR_GREY_POLO', 'S', 0, 0, 0),
      ('MGR_GREY_POLO', 'M', 5, 1, 4),
      ('MGR_GREY_POLO', 'L', 5, 1, 4),
      ('MGR_GREY_POLO', 'XL', 10, 1, 9),
      ('MGR_GREY_POLO', 'XXL', 0, 0, 0)
    ) as t(sku, size, opening_qty, stock_out, current_qty)
  loop
    select id into v_item from public.uniform_items where sku_code = r.sku;
    if v_item is null then
      raise exception 'missing uniform item %', r.sku;
    end if;

    insert into public.uniform_stock_levels (item_id, size, opening_qty, current_qty, updated_at)
    values (v_item, r.size, r.opening_qty, r.current_qty, now())
    on conflict (item_id, size) do update
    set
      opening_qty = excluded.opening_qty,
      current_qty = excluded.current_qty,
      updated_at = now();

    if r.stock_out > 0 then
      -- Idempotent seed: only insert if no pre_portal movement for this cell yet
      if not exists (
        select 1
        from public.uniform_stock_movements m
        where m.item_id = v_item
          and m.size = r.size
          and m.reason = 'pre_portal_stock_out'
      ) then
        insert into public.uniform_stock_movements (
          item_id, size, delta, reason, note
        ) values (
          v_item,
          r.size,
          -r.stock_out,
          'pre_portal_stock_out',
          'Seeded from office opening sheet (pre-portal stock out)'
        );
      end if;
    end if;
  end loop;
end $$;

comment on table public.uniform_items is
  'Uniform SKU catalog (staff + manager garments).';
comment on table public.uniform_stock_levels is
  'Live stock by item+size; opening_qty frozen at seed; current_qty updated by Edge Functions.';
comment on table public.uniform_issues is
  'Per-employee uniform ledger with dual typed acknowledgements.';
comment on table public.uniform_stock_movements is
  'Immutable stock deltas; current should equal opening + sum(deltas) per item+size.';
