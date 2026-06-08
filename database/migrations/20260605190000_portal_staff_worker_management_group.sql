-- Pool staff (not leads) may read/write the CEO liaison group for the Directors (group) contact.

begin;

drop policy if exists portal_ceo_group_select_staff_worker_mgmt on public.portal_ceo_group;
create policy portal_ceo_group_select_staff_worker_mgmt
  on public.portal_ceo_group
  for select
  to authenticated
  using (
    slug = 'ceo_liaison'
    and public.portal_staff_profile_is_staff_only_messenger()
  );

drop policy if exists portal_ceo_group_message_select_staff_worker_mgmt on public.portal_ceo_group_message;
create policy portal_ceo_group_message_select_staff_worker_mgmt
  on public.portal_ceo_group_message
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'ceo_liaison'
    )
    and public.portal_staff_profile_is_staff_only_messenger()
  );

drop policy if exists portal_ceo_group_message_insert_staff_worker_mgmt on public.portal_ceo_group_message;
create policy portal_ceo_group_message_insert_staff_worker_mgmt
  on public.portal_ceo_group_message
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'ceo_liaison'
    )
    and public.portal_staff_profile_is_staff_only_messenger()
  );

comment on table public.portal_ceo_group is
  'Shared group threads: CEO circles, Staff & leads ops ring (legacy), Session leads channel, and staff worker Directors (group) via ceo_liaison.';

commit;
