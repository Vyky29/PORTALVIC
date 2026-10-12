-- Office can delete a family API message for everyone who sees the thread.

begin;

drop policy if exists portal_parent_notify_log_delete_admin
  on public.portal_parent_notify_log;
create policy portal_parent_notify_log_delete_admin
  on public.portal_parent_notify_log
  for delete
  to authenticated
  using (public.portal_staff_profile_is_portal_admin());

grant delete on public.portal_parent_notify_log to authenticated;

drop policy if exists portal_parent_whatsapp_inbound_delete_admin
  on public.portal_parent_whatsapp_inbound;
create policy portal_parent_whatsapp_inbound_delete_admin
  on public.portal_parent_whatsapp_inbound
  for delete
  to authenticated
  using (public.portal_staff_profile_is_portal_admin());

grant delete on public.portal_parent_whatsapp_inbound to authenticated;

commit;
