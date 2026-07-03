-- Expenses backend.
-- Front-end submits expense lines; server persists claim rows in Supabase.

begin;

create table if not exists public.expense_claims (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  submitted_by_role text null,
  claim_month date null,
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  line_items jsonb not null default '[]'::jsonb,
  status text not null default 'submitted',
  submitted_on date not null default current_date,
  constraint expense_claims_status_check check (status in ('submitted', 'reviewed', 'approved', 'rejected', 'paid'))
);

comment on table public.expense_claims is
  'Staff expense claims with line items and totals. Receipts can be handled separately (storage/workflow).';

create index if not exists expense_claims_submitted_by_user_id_idx
  on public.expense_claims (submitted_by_user_id);

create index if not exists expense_claims_created_at_idx
  on public.expense_claims (created_at desc);

create or replace function public.expense_claims_apply_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.submitted_by_user_id is null then
    new.submitted_by_user_id := auth.uid();
  end if;

  if new.submitted_by_user_id is null then
    raise exception 'Unauthenticated user';
  end if;

  select coalesce(nullif(trim(sp.full_name), ''), nullif(trim(sp.username), '')),
         nullif(trim(coalesce(sp.role_track, sp.role, sp.app_role)), '')
  into new.submitted_by_name, new.submitted_by_role
  from public.staff_profiles sp
  where sp.id = new.submitted_by_user_id;

  if coalesce(trim(new.submitted_by_name), '') = '' then
    raise exception 'Missing staff profile display name';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_expense_claims_apply_server_fields on public.expense_claims;
create trigger trg_expense_claims_apply_server_fields
before insert or update on public.expense_claims
for each row
execute function public.expense_claims_apply_server_fields();

alter table public.expense_claims enable row level security;

grant insert, select, update on table public.expense_claims to authenticated;

drop policy if exists "expense_claims_insert_own" on public.expense_claims;
create policy "expense_claims_insert_own"
on public.expense_claims
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
);

drop policy if exists "expense_claims_select_own_admin_ceo" on public.expense_claims;
create policy "expense_claims_select_own_admin_ceo"
on public.expense_claims
for select
to authenticated
using (
  submitted_by_user_id = auth.uid()
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "expense_claims_update_admin_ceo" on public.expense_claims;
create policy "expense_claims_update_admin_ceo"
on public.expense_claims
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

commit;

