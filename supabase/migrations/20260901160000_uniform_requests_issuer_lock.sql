-- Staff uniform requests (ask only; issuers: Berta, Roberto, Michelle, John).

create table if not exists public.uniform_requests (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles (id) on delete cascade,
  item_id uuid null references public.uniform_items (id) on delete set null,
  size text null check (size is null or size in ('S', 'M', 'L', 'XL', 'XXL')),
  qty int not null default 1 check (qty > 0 and qty <= 20),
  request_type text not null default 'initial' check (
    request_type in ('initial', 'replacement', 'size_change', 'other')
  ),
  reason text null,
  charge_applies_expected boolean not null default false,
  status text not null default 'open' check (
    status in ('open', 'fulfilled', 'declined', 'cancelled')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null references public.staff_profiles (id) on delete set null,
  resolve_note text null
);

create index if not exists uniform_requests_staff_idx
  on public.uniform_requests (staff_profile_id, created_at desc);
create index if not exists uniform_requests_status_idx
  on public.uniform_requests (status, created_at desc);

alter table public.uniform_requests enable row level security;

drop policy if exists uniform_requests_own_select on public.uniform_requests;
create policy uniform_requests_own_select
  on public.uniform_requests
  for select
  to authenticated
  using (
    staff_profile_id = (select auth.uid())
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(trim(coalesce(sp.username, ''))) in ('berta', 'roberto', 'michelle', 'john')
    )
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(sp.app_role, '')) in ('admin', 'ceo')
    )
  );

grant select on public.uniform_requests to authenticated;
grant all on public.uniform_requests to service_role;

comment on table public.uniform_requests is
  'Staff ask for uniform; only Berta/Roberto/Michelle/John fulfil via uniform-issue.';
