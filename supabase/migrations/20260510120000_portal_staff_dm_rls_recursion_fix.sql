-- Fix: infinite recursion detected in policy for relation 'portal_staff_dm_threads'
-- Cause: INSERT on portal_staff_dm_threads WITH CHECK subqueries staff_profiles; a SELECT policy
-- on staff_profiles subqueries portal_staff_dm_threads, which re-enters threads RLS.
-- Fix: SECURITY DEFINER helpers that read each table once without RLS re-entry.

begin;

-- Peer row exists (for thread INSERT validation); bypasses staff_profiles RLS.
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

-- DM counterpart read: true if auth user and peer appear together on a thread row; bypasses threads RLS.
create or replace function public.portal_staff_dm_thread_joins_users(viewer uuid, peer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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
  'True when a DM thread links viewer and peer. SECURITY DEFINER avoids RLS recursion with staff_profiles SELECT.';

revoke all on function public.portal_staff_dm_thread_joins_users(uuid, uuid) from public;
grant execute on function public.portal_staff_dm_thread_joins_users(uuid, uuid) to authenticated;

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
