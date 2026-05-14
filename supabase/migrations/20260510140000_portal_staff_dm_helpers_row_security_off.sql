-- Harden DM RLS helpers: inside SECURITY DEFINER, PostgreSQL may still apply RLS to the
-- definer role on Supabase / non-superuser owners, which re-enters staff_profiles policies
-- that call portal_staff_dm_thread_joins_users → portal_staff_dm_threads →
-- "infinite recursion detected in policy for relation portal_staff_dm_threads".
-- SET row_security TO off for the function body breaks that cycle.

begin;

create or replace function public.portal_staff_profile_exists_by_id(user_id uuid)
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
  );
$$;

comment on function public.portal_staff_profile_exists_by_id(uuid) is
  'True if staff_profiles has a row for user_id. SECURITY DEFINER + row_security off avoids DM/RLS recursion.';

revoke all on function public.portal_staff_profile_exists_by_id(uuid) from public;
grant execute on function public.portal_staff_profile_exists_by_id(uuid) to authenticated;

create or replace function public.portal_staff_dm_thread_joins_users(viewer uuid, peer uuid)
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.portal_staff_dm_threads t
    where
      (t.participant_a = viewer and t.participant_b = peer)
      or (t.participant_a = peer and t.participant_b = viewer)
  );
$$;

comment on function public.portal_staff_dm_thread_joins_users(uuid, uuid) is
  'True when a DM thread links viewer and peer. SECURITY DEFINER + row_security off avoids RLS recursion.';

revoke all on function public.portal_staff_dm_thread_joins_users(uuid, uuid) from public;
grant execute on function public.portal_staff_dm_thread_joins_users(uuid, uuid) to authenticated;

create or replace function public.portal_staff_profile_is_admin_or_ceo()
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
      and sp.app_role in ('admin', 'ceo')
  );
$$;

comment on function public.portal_staff_profile_is_admin_or_ceo() is
  'True when current user is admin/ceo. SECURITY DEFINER + row_security off for stable RLS use.';

revoke all on function public.portal_staff_profile_is_admin_or_ceo() from public;
grant execute on function public.portal_staff_profile_is_admin_or_ceo() to authenticated;

create or replace function public.portal_staff_profile_is_office_dm_target(user_id uuid)
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
      and sp.app_role in ('admin', 'ceo')
      and (sp.is_active is distinct from false)
  );
$$;

comment on function public.portal_staff_profile_is_office_dm_target(uuid) is
  'True when user_id is an active admin or CEO. SECURITY DEFINER + row_security off.';

revoke all on function public.portal_staff_profile_is_office_dm_target(uuid) from public;
grant execute on function public.portal_staff_profile_is_office_dm_target(uuid) to authenticated;

create or replace function public.portal_staff_profile_is_staff_or_lead_messenger()
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
      and sp.app_role in ('staff', 'lead')
  );
$$;

comment on function public.portal_staff_profile_is_staff_or_lead_messenger() is
  'True when current user is staff or lead. SECURITY DEFINER + row_security off.';

revoke all on function public.portal_staff_profile_is_staff_or_lead_messenger() from public;
grant execute on function public.portal_staff_profile_is_staff_or_lead_messenger() to authenticated;

-- Re-assert thread insert + peer read policies (idempotent; ensures no stale inline staff_profiles EXISTS).
drop policy if exists "portal_staff_dm_threads_insert_admin_ceo" on public.portal_staff_dm_threads;
create policy "portal_staff_dm_threads_insert_admin_ceo"
  on public.portal_staff_dm_threads
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.portal_staff_profile_is_admin_or_ceo()
    and (participant_a = (select auth.uid()) or participant_b = (select auth.uid()))
    and public.portal_staff_profile_exists_by_id(
      case
        when participant_a = (select auth.uid()) then participant_b
        else participant_a
      end
    )
  );

drop policy if exists "staff_profiles_select_dm_thread_peer" on public.staff_profiles;
create policy "staff_profiles_select_dm_thread_peer"
  on public.staff_profiles
  for select
  to authenticated
  using (
    public.portal_staff_dm_thread_joins_users((select auth.uid()), staff_profiles.id)
  );

commit;
