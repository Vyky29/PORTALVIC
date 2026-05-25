-- Internal chat (admin): recipient directory read for managers who use admin_dashboard
-- via staff_role = manager, not only app_role admin/ceo (portal_staff_profile_is_admin_or_ceo).

create or replace function public.portal_staff_profile_can_admin_dm_directory()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and (
        lower(coalesce(sp.app_role, '')) in ('admin', 'ceo')
        or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
      )
  );
$$;

comment on function public.portal_staff_profile_can_admin_dm_directory() is
  'Admin Internal chat directory: admin/ceo app_role or manager/admin staff_role (matches auth-handler admin access).';

revoke all on function public.portal_staff_profile_can_admin_dm_directory() from public;
grant execute on function public.portal_staff_profile_can_admin_dm_directory() to authenticated;

drop policy if exists "staff_profiles_admin_ceo_directory_read" on public.staff_profiles;

create policy "staff_profiles_admin_ceo_directory_read"
  on public.staff_profiles
  for select
  to authenticated
  using (public.portal_staff_profile_can_admin_dm_directory());
