-- Mirror of database/migrations/20260511120000_portal_staff_dm_admin_ceo_shared_inbox.sql

begin;

drop policy if exists "portal_staff_dm_threads_select_admin_ceo_shared_inbox" on public.portal_staff_dm_threads;
create policy "portal_staff_dm_threads_select_admin_ceo_shared_inbox"
  on public.portal_staff_dm_threads
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_staff_dm_messages_select_admin_ceo_shared_inbox" on public.portal_staff_dm_messages;
create policy "portal_staff_dm_messages_select_admin_ceo_shared_inbox"
  on public.portal_staff_dm_messages
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_staff_dm_messages_insert_admin_ceo_shared_inbox" on public.portal_staff_dm_messages;
create policy "portal_staff_dm_messages_insert_admin_ceo_shared_inbox"
  on public.portal_staff_dm_messages
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.portal_staff_profile_is_admin_or_ceo()
    and exists (
      select 1
      from public.portal_staff_dm_threads t
      where t.id = thread_id
    )
  );

commit;
