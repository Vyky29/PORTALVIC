-- Client payments store (fed by the "SUMMER. Re-enrolments" workbook).
-- One row per spreadsheet row, grouped by `sheet` (PARENTS / LA / No re-enroled).
-- Heterogeneous columns kept in `data` (json) so the workbook can evolve without
-- schema churn; the actionable fields (status, amount, client) are promoted to
-- columns for fast filtering and totals.
--
-- Contains client PII (names, parents, amounts) => RLS locks it to admin / CEO.
-- Loaded locally from payments_source/ (never committed, never deployed). The
-- browser uses only the anon key + this RLS. Edits in the admin app win
-- (the workbook is the initial load only).

begin;

create table if not exists public.client_payments (
  id             uuid primary key default gen_random_uuid(),
  sheet          text not null,
  row_index      integer,
  client_key     text,
  client_name    text,
  parent_name    text,
  payment_status text,                       -- Paid / Outstanding / Not paid / Not re-enrolled
  amount         numeric(12,2),              -- total billed for the row
  data           json not null default '{}'::json, -- json (not jsonb) to preserve column order
  source_file    text,
  imported_at    timestamptz not null default now()
);

comment on table public.client_payments is
  'Client re-enrolment payments imported from the SUMMER workbook. Admin/CEO only (PII).';

create index if not exists client_payments_sheet_idx      on public.client_payments (sheet);
create index if not exists client_payments_client_key_idx on public.client_payments (client_key);
create index if not exists client_payments_status_idx     on public.client_payments (payment_status);

alter table public.client_payments enable row level security;

grant select, insert, update, delete on table public.client_payments to authenticated;

-- Admin / CEO: full access.
drop policy if exists "client_payments_admin_all" on public.client_payments;
create policy "client_payments_admin_all"
on public.client_payments
for all
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

commit;
