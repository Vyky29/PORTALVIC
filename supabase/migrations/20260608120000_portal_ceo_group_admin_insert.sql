-- Admin/CEO may create new portal_ceo_group rows from CS Cliq Channels pane.

begin;

drop policy if exists portal_ceo_group_insert_admin_ceo on public.portal_ceo_group;
create policy portal_ceo_group_insert_admin_ceo
  on public.portal_ceo_group
  for insert
  to authenticated
  with check (public.portal_staff_profile_is_admin_or_ceo());

commit;
