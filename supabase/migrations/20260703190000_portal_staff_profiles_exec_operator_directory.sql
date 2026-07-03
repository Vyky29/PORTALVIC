-- Allow admin-dashboard operators (exec operator gate) to read staff directory for announcement composer.

begin;

drop policy if exists "staff_profiles_select_exec_operator_directory" on public.staff_profiles;

create policy "staff_profiles_select_exec_operator_directory"
  on public.staff_profiles
  for select
  to authenticated
  using (public.portal_staff_profile_is_exec_operator());

commit;
