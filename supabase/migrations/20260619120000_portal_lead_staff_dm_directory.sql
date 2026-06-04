-- Lead dashboard: read team staff_profiles + start DM threads with any active colleague.
-- Staff (non-lead) keep office-only directory + insert from 20260523160000.

begin;

create or replace function public.portal_staff_profile_is_lead_messenger()
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
      and sp.is_active is distinct from false
      and (
        lower(coalesce(sp.app_role, '')) = 'lead'
        or lower(coalesce(sp.dashboard_route, '')) = 'lead_dashboard.html'
      )
  );
$$;

comment on function public.portal_staff_profile_is_lead_messenger() is
  'True when current user is an active lead (app_role lead or lead_dashboard route).';

revoke all on function public.portal_staff_profile_is_lead_messenger() from public;
grant execute on function public.portal_staff_profile_is_lead_messenger() to authenticated;

create or replace function public.portal_staff_profile_is_lead_dm_peer(user_id uuid)
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
    where sp.id = user_id
      and sp.is_active is distinct from false
      and sp.id is distinct from (select auth.uid())
  );
$$;

comment on function public.portal_staff_profile_is_lead_dm_peer(uuid) is
  'Active staff_profiles row other than self — valid DM peer for a lead messenger.';

revoke all on function public.portal_staff_profile_is_lead_dm_peer(uuid) from public;
grant execute on function public.portal_staff_profile_is_lead_dm_peer(uuid) to authenticated;

drop policy if exists "staff_profiles_select_lead_team_directory" on public.staff_profiles;

create policy "staff_profiles_select_lead_team_directory"
  on public.staff_profiles
  for select
  to authenticated
  using (
    public.portal_staff_profile_is_lead_messenger()
    and (is_active is null or is_active = true)
    and id is distinct from (select auth.uid())
  );

drop policy if exists "portal_staff_dm_threads_insert_lead_to_team" on public.portal_staff_dm_threads;

create policy "portal_staff_dm_threads_insert_lead_to_team"
  on public.portal_staff_dm_threads
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.portal_staff_profile_is_lead_messenger()
    and (participant_a = (select auth.uid()) or participant_b = (select auth.uid()))
    and public.portal_staff_profile_is_lead_dm_peer(
      case
        when participant_a = (select auth.uid()) then participant_b
        else participant_a
      end
    )
  );

commit;
