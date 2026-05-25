-- Portal DM: allow admin dashboard operators (manager/admin staff_role) to create/read threads.
-- Fixes: "new row violates row-level security policy for table portal_staff_dm_threads"
-- when a manager uses admin_dashboard Internal chat / CEO's Chat.

begin;

create or replace function public.portal_staff_profile_is_exec_operator()
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

comment on function public.portal_staff_profile_is_exec_operator() is
  'True when current user is admin/ceo app_role OR manager/admin staff_role. SECURITY DEFINER + row_security off for stable RLS use.';

revoke all on function public.portal_staff_profile_is_exec_operator() from public;
grant execute on function public.portal_staff_profile_is_exec_operator() to authenticated;

-- Threads: operator may create when they are one participant and the peer exists in staff_profiles.
drop policy if exists "portal_staff_dm_threads_insert_admin_ceo" on public.portal_staff_dm_threads;
create policy "portal_staff_dm_threads_insert_admin_ceo"
  on public.portal_staff_dm_threads
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.portal_staff_profile_is_exec_operator()
    and (participant_a = (select auth.uid()) or participant_b = (select auth.uid()))
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = case
        when participant_a = (select auth.uid()) then participant_b
        else participant_a
      end
    )
  );

-- Shared inbox: operator can view all threads/messages + reply into existing threads.
drop policy if exists "portal_staff_dm_threads_select_admin_ceo_shared_inbox" on public.portal_staff_dm_threads;
create policy "portal_staff_dm_threads_select_admin_ceo_shared_inbox"
  on public.portal_staff_dm_threads
  for select
  to authenticated
  using (public.portal_staff_profile_is_exec_operator());

drop policy if exists "portal_staff_dm_messages_select_admin_ceo_shared_inbox" on public.portal_staff_dm_messages;
create policy "portal_staff_dm_messages_select_admin_ceo_shared_inbox"
  on public.portal_staff_dm_messages
  for select
  to authenticated
  using (public.portal_staff_profile_is_exec_operator());

drop policy if exists "portal_staff_dm_messages_insert_admin_ceo_shared_inbox" on public.portal_staff_dm_messages;
create policy "portal_staff_dm_messages_insert_admin_ceo_shared_inbox"
  on public.portal_staff_dm_messages
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.portal_staff_profile_is_exec_operator()
    and exists (select 1 from public.portal_staff_dm_threads t where t.id = thread_id)
  );

commit;

