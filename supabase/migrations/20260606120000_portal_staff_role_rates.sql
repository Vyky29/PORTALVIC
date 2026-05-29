-- Multi-role pay rates: a worker can hold several roles, each with its own
-- scale and hourly rate (e.g. Bismark = Support Worker Scale 3 AND Climbing
-- Instructor Scale 1). The payroll report / timesheet pick the rate that
-- matches the role detected from each roster session's `service`.
--
-- This complements (does not drop) the legacy single-rate `staff_pay_rates`.
-- Admin/CEO can edit these rows from the browser (write RLS below); later the
-- signed employment_contracts can feed the same table.

begin;

create table if not exists public.staff_role_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,                 -- 'Swimming Instructor' | 'Climbing Instructor' | 'Fitness Instructor' | 'Support Worker' | 'Service Lead'
  scale text null,                    -- 'Scale 1' | 'Scale 2' | 'Scale 3' | null
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  is_primary boolean not null default false,
  note text null,
  updated_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role)
);

comment on table public.staff_role_rates is
  'Per-staff pay rates by role + scale (server-side only). A worker may have several rows (one per role they deliver).';

create index if not exists staff_role_rates_user_id_idx
  on public.staff_role_rates (user_id);

-- At most one primary role per worker.
create unique index if not exists staff_role_rates_one_primary_per_user
  on public.staff_role_rates (user_id)
  where is_primary;

-- Keep updated_at fresh.
create or replace function public.staff_role_rates_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_staff_role_rates_touch on public.staff_role_rates;
create trigger trg_staff_role_rates_touch
before update on public.staff_role_rates
for each row execute function public.staff_role_rates_touch_updated_at();

alter table public.staff_role_rates enable row level security;

grant select, insert, update, delete on table public.staff_role_rates to authenticated;

-- Read: own rows, or any for admin/ceo.
drop policy if exists "staff_role_rates_select_own_admin_ceo" on public.staff_role_rates;
create policy "staff_role_rates_select_own_admin_ceo"
on public.staff_role_rates
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

-- Write (insert/update/delete): admin/ceo only.
drop policy if exists "staff_role_rates_insert_admin_ceo" on public.staff_role_rates;
create policy "staff_role_rates_insert_admin_ceo"
on public.staff_role_rates
for insert
to authenticated
with check (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "staff_role_rates_update_admin_ceo" on public.staff_role_rates;
create policy "staff_role_rates_update_admin_ceo"
on public.staff_role_rates
for update
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "staff_role_rates_delete_admin_ceo" on public.staff_role_rates;
create policy "staff_role_rates_delete_admin_ceo"
on public.staff_role_rates
for delete
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

-- Seed each known worker's PRIMARY role (rates from the contract RATE_TABLE).
-- Admin adds secondary roles (e.g. Bismark + Climbing) from the Pay rates page.
insert into public.staff_role_rates (user_id, role, scale, hourly_rate, is_primary)
select sp.id, v.role, v.scale, v.hourly_rate, true
from public.staff_profiles sp
join (values
  ('youssef',  'Swimming Instructor', 'Scale 1', 22.00::numeric),
  ('roberto',  'Swimming Instructor', 'Scale 2', 24.00::numeric),
  ('aurora',   'Swimming Instructor', 'Scale 3', 28.00::numeric),
  ('angel',    'Swimming Instructor', 'Scale 3', 28.00::numeric),
  ('dan',      'Swimming Instructor', 'Scale 3', 28.00::numeric),
  ('javier',   'Swimming Instructor', 'Scale 3', 28.00::numeric),
  ('alex',     'Climbing Instructor', 'Scale 3', 30.00::numeric),
  ('carlos',   'Climbing Instructor', 'Scale 3', 30.00::numeric),
  ('sandra',   'Fitness Instructor',  'Scale 1', 24.00::numeric),
  ('godsway',  'Support Worker',      'Scale 1', 18.00::numeric),
  ('giuseppe', 'Support Worker',      'Scale 2', 20.00::numeric),
  ('bismark',  'Support Worker',      'Scale 3', 23.00::numeric),
  ('john',     'Service Lead',        null,      30.00::numeric),
  ('berta',    'Service Lead',        null,      30.00::numeric)
) as v(staff_name, role, scale, hourly_rate)
  on lower(coalesce(sp.username, '')) = v.staff_name
  or lower(coalesce(sp.full_name, '')) = v.staff_name
on conflict (user_id, role) do nothing;

commit;
