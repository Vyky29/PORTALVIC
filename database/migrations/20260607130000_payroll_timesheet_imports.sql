-- Payroll imports: monthly pay figures for periods that exist only as PDFs in
-- Documents (no structured staff_timesheets row), plus contract/invoice people
-- paid outside the timesheet flow. The monthly payroll report sums this table
-- alongside staff_timesheets so past months of this year appear in the report.
--
-- Kept separate from staff_timesheets on purpose: that table's trigger
-- recomputes total_cost from `entries`, so a hand-entered total would be lost.
-- Here `gross` is stored verbatim.

begin;

create table if not exists public.staff_timesheet_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users (id) on delete set null,  -- null for ex-staff with no account (e.g. Martin)
  period_month date not null,
  name text not null,
  name_key text generated always as (lower(name)) stored,
  role text null,
  pay_type text not null default 'timesheet' check (pay_type in ('timesheet', 'contract')),
  total_hours numeric(10,2) null,
  gross numeric(10,2) null,
  note text null,
  imported_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.staff_timesheet_imports is
  'Hand-imported monthly pay figures (from the PDFs/figures sent to the accountant). pay_type=contract = paid outside the timesheet flow.';

-- One figure per person per month (works with a null user_id via the name key).
create unique index if not exists staff_timesheet_imports_month_namekey_uidx
  on public.staff_timesheet_imports (period_month, name_key);

create index if not exists staff_timesheet_imports_month_idx
  on public.staff_timesheet_imports (period_month);

create or replace function public.staff_timesheet_imports_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_staff_timesheet_imports_touch on public.staff_timesheet_imports;
create trigger trg_staff_timesheet_imports_touch
before update on public.staff_timesheet_imports
for each row execute function public.staff_timesheet_imports_touch_updated_at();

alter table public.staff_timesheet_imports enable row level security;

grant select, insert, update, delete on table public.staff_timesheet_imports to authenticated;

-- Admin/CEO only (payroll figures).
drop policy if exists "staff_timesheet_imports_select_admin_ceo" on public.staff_timesheet_imports;
create policy "staff_timesheet_imports_select_admin_ceo"
on public.staff_timesheet_imports
for select
to authenticated
using (
  exists (select 1 from public.staff_profiles sp where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo'))
);

drop policy if exists "staff_timesheet_imports_insert_admin_ceo" on public.staff_timesheet_imports;
create policy "staff_timesheet_imports_insert_admin_ceo"
on public.staff_timesheet_imports
for insert
to authenticated
with check (
  exists (select 1 from public.staff_profiles sp where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo'))
);

drop policy if exists "staff_timesheet_imports_update_admin_ceo" on public.staff_timesheet_imports;
create policy "staff_timesheet_imports_update_admin_ceo"
on public.staff_timesheet_imports
for update
to authenticated
using (
  exists (select 1 from public.staff_profiles sp where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo'))
)
with check (
  exists (select 1 from public.staff_profiles sp where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo'))
);

drop policy if exists "staff_timesheet_imports_delete_admin_ceo" on public.staff_timesheet_imports;
create policy "staff_timesheet_imports_delete_admin_ceo"
on public.staff_timesheet_imports
for delete
to authenticated
using (
  exists (select 1 from public.staff_profiles sp where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo'))
);

commit;
