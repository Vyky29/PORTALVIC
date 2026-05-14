-- Shared operations inbox: any authenticated user whose staff_profiles.app_role is
-- 'admin' or 'ceo' may SELECT all portal_staff_dm_threads / portal_staff_dm_messages,
-- and INSERT messages on any existing thread as themselves (author_id = auth.uid()).
--
-- Rationale: Victor↔Staff threads are visible to Raul/Javi/Sevitha on the same admin board
-- without adding every executive as a DM participant. Staff/lead still only see threads
-- they participate in (existing policies + portal_staff_profile_is_admin_or_ceo() is false).
--
-- Requires: public.portal_staff_profile_is_admin_or_ceo() (e.g. 20260510140000 helpers).

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
