-- Fix: "infinite recursion detected in policy for relation staff_profiles"
-- Cause: policy staff_profiles_admin_ceo_directory_read used EXISTS (SELECT … FROM staff_profiles …),
-- which re-evaluated RLS on staff_profiles.
-- Apply in Supabase SQL Editor if migration 20260508120000_portal_staff_announcements_targets.sql was already run.

begin;

create or replace function public.portal_staff_profile_is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.app_role in ('admin', 'ceo')
  );
$$;

comment on function public.portal_staff_profile_is_admin_or_ceo() is
  'True when current user is admin/ceo in staff_profiles. SECURITY DEFINER avoids RLS recursion when used from staff_profiles policies.';

revoke all on function public.portal_staff_profile_is_admin_or_ceo() from public;
grant execute on function public.portal_staff_profile_is_admin_or_ceo() to authenticated;

drop policy if exists "staff_profiles_admin_ceo_directory_read" on public.staff_profiles;

create policy "staff_profiles_admin_ceo_directory_read"
  on public.staff_profiles
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

commit;
