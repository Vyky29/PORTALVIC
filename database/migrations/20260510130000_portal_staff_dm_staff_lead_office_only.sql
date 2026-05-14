-- Staff / lead: may create DM threads only with users whose staff_profiles.app_role is admin or CEO.
-- Staff / lead: may read admin+CEO rows for the office picker (no recursion into threads).
-- Admins / CEOs keep existing insert policy (message any staff profile).
--
-- Also defines portal_staff_profile_exists_by_id (same as 20260510120000) so this file applies
-- standalone if that migration was skipped.

begin;

create or replace function public.portal_staff_profile_exists_by_id(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = user_id
  );
$$;

comment on function public.portal_staff_profile_exists_by_id(uuid) is
  'True if staff_profiles has a row for user_id. SECURITY DEFINER avoids RLS recursion with portal_staff_dm_threads insert policy.';

revoke all on function public.portal_staff_profile_exists_by_id(uuid) from public;
grant execute on function public.portal_staff_profile_exists_by_id(uuid) to authenticated;

create or replace function public.portal_staff_profile_is_office_dm_target(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = user_id
      and sp.app_role in ('admin', 'ceo')
      and (sp.is_active is distinct from false)
  );
$$;

comment on function public.portal_staff_profile_is_office_dm_target(uuid) is
  'True when user_id is an active admin or CEO in staff_profiles. Used for staff/lead DM thread insert RLS.';

revoke all on function public.portal_staff_profile_is_office_dm_target(uuid) from public;
grant execute on function public.portal_staff_profile_is_office_dm_target(uuid) to authenticated;

create or replace function public.portal_staff_profile_is_staff_or_lead_messenger()
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
      and sp.app_role in ('staff', 'lead')
  );
$$;

comment on function public.portal_staff_profile_is_staff_or_lead_messenger() is
  'True when current user is staff or lead (portal internal chat restriction). SECURITY DEFINER.';

revoke all on function public.portal_staff_profile_is_staff_or_lead_messenger() from public;
grant execute on function public.portal_staff_profile_is_staff_or_lead_messenger() to authenticated;

drop policy if exists "staff_profiles_select_office_dm_directory" on public.staff_profiles;
create policy "staff_profiles_select_office_dm_directory"
  on public.staff_profiles
  for select
  to authenticated
  using (
    app_role in ('admin', 'ceo')
    and (is_active is null or is_active = true)
    and public.portal_staff_profile_is_staff_or_lead_messenger()
  );

drop policy if exists "portal_staff_dm_threads_insert_staff_lead_to_office" on public.portal_staff_dm_threads;
create policy "portal_staff_dm_threads_insert_staff_lead_to_office"
  on public.portal_staff_dm_threads
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.portal_staff_profile_is_staff_or_lead_messenger()
    and (participant_a = (select auth.uid()) or participant_b = (select auth.uid()))
    and public.portal_staff_profile_is_office_dm_target(
      case
        when participant_a = (select auth.uid()) then participant_b
        else participant_a
      end
    )
    and public.portal_staff_profile_exists_by_id(
      case
        when participant_a = (select auth.uid()) then participant_b
        else participant_a
      end
    )
  );

commit;
