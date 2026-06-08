-- CS Team directory: session leads may read other active leads (display in accordion).

begin;

drop policy if exists "staff_profiles_select_leads_for_lead_directory" on public.staff_profiles;

create policy "staff_profiles_select_leads_for_lead_directory"
  on public.staff_profiles
  for select
  to authenticated
  using (
    lower(coalesce(app_role, '')) = 'lead'
    and (is_active is null or is_active = true)
    and public.portal_staff_profile_is_lead_only_messenger()
  );

commit;
