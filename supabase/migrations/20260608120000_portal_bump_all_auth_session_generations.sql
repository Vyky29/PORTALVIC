-- Ops: bump auth_session_generation for all active staff (force global sign-out).
-- Callable with service_role only; ad-hoc sign-out can also run the UPDATE in step-global-signout-2026-06-08.sql.

begin;

create or replace function public.portal_bump_all_auth_session_generations()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  update public.staff_profiles
     set auth_session_generation = coalesce(auth_session_generation, 0) + 1
   where coalesce(is_active, true) = true;
  get diagnostics v = row_count;
  return coalesce(v, 0);
end;
$$;

revoke all on function public.portal_bump_all_auth_session_generations() from public;
grant execute on function public.portal_bump_all_auth_session_generations() to service_role;

commit;
