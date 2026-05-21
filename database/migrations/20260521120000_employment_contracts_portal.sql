-- Employment contracts: HR prepares + director signs; staff signs via Portal dashboard ? Documents.
-- Requires: portal_staff_announcements (20260504120000 + 20260508120000), documents bucket (20260423).

begin;

create table if not exists public.employment_contracts (
  id uuid primary key default gen_random_uuid(),
  signing_token text unique not null,
  contract_reference text not null,
  contract_version text not null default '1.0',
  status text not null default 'awaiting_employee'
    check (status in ('awaiting_employee', 'completed', 'expired')),
  user_id uuid not null references auth.users (id) on delete restrict,
  employee_name text not null,
  employee_email text not null,
  employee_address text,
  contract_date date,
  commencement_date date,
  role text,
  scale text,
  delivery_rate text,
  director_name text,
  form_payload jsonb not null default '{}'::jsonb,
  template_data jsonb not null default '{}'::jsonb,
  director_signature text not null,
  employee_signature text,
  employee_typed_name text,
  employee_acknowledged boolean default false,
  hr_notes text,
  announcement_id uuid null references public.portal_staff_announcements (id) on delete set null,
  document_id uuid null,
  created_by_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  sent_at timestamptz,
  completed_at timestamptz,
  employee_signed_at timestamptz
);

create index if not exists employment_contracts_user_status_idx
  on public.employment_contracts (user_id, status);
create index if not exists employment_contracts_signing_token_idx
  on public.employment_contracts (signing_token);
create index if not exists employment_contracts_reference_idx
  on public.employment_contracts (contract_reference);

comment on table public.employment_contracts is
  'Zero-hours employment contracts; staff sign from dashboard notice; PDF archived in documents.';

-- Resolve staff auth user id from work email (service role / HR API).
create or replace function public.portal_user_id_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select au.id
  from auth.users au
  where lower(au.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.portal_user_id_for_email(text) from public;
grant execute on function public.portal_user_id_for_email(text) to service_role;
grant execute on function public.portal_user_id_for_email(text) to authenticated;

alter table public.employment_contracts enable row level security;

grant select, update on public.employment_contracts to authenticated;
grant all on public.employment_contracts to service_role;

drop policy if exists employment_contracts_select_own on public.employment_contracts;
create policy employment_contracts_select_own
  on public.employment_contracts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists employment_contracts_select_admin on public.employment_contracts;
create policy employment_contracts_select_admin
  on public.employment_contracts
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists employment_contracts_update_sign_own on public.employment_contracts;
create policy employment_contracts_update_sign_own
  on public.employment_contracts
  for update
  to authenticated
  using (user_id = auth.uid() and status = 'awaiting_employee')
  with check (user_id = auth.uid());

commit;
