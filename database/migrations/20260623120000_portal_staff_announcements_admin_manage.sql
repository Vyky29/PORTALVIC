-- Mirror of supabase/migrations/20260623120000_portal_staff_announcements_admin_manage.sql

begin;

grant update, delete on public.portal_staff_announcements to authenticated;

drop policy if exists "portal_staff_announcements_update_admin_ceo" on public.portal_staff_announcements;
create policy "portal_staff_announcements_update_admin_ceo"
  on public.portal_staff_announcements
  for update
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_staff_announcements_delete_admin_ceo" on public.portal_staff_announcements;
create policy "portal_staff_announcements_delete_admin_ceo"
  on public.portal_staff_announcements
  for delete
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

comment on table public.portal_staff_announcement_acks is
  'Staff/lead ack on a portal_staff_announcements row (announcement or reminder); one row per user per message.';

commit;
