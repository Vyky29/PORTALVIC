-- Admin / CEO: create employment contracts from Portal Vic (hr_contract.html).

begin;

grant insert on public.employment_contracts to authenticated;

drop policy if exists employment_contracts_insert_admin on public.employment_contracts;
create policy employment_contracts_insert_admin
  on public.employment_contracts
  for insert
  to authenticated
  with check (public.portal_staff_profile_is_admin_or_ceo());

commit;
