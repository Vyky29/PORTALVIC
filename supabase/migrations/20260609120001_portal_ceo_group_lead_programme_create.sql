-- Session leads may create programme group channels from CS Cliq (lead dashboard simplified inbox).
-- System / pool slugs remain admin-managed only.

begin;

create or replace function public.portal_ceo_group_is_system_slug(slug text)
returns boolean
language sql
stable
security definer
set search_path to public
as $$
  select coalesce(
    lower(trim(slug)),
    ''
  ) in (
    'all_ceos',
    'ceo_liaison',
    'session_leads',
    'staff_leads_ops',
    'swimming_instructors',
    'climbing_instructors',
    'support_staff',
    'pool_leads',
    'staff_worker_mgmt'
  );
$$;

comment on function public.portal_ceo_group_is_system_slug(text) is
  'Reserved portal_ceo_group slugs — not creatable by session leads from CS Cliq.';

revoke all on function public.portal_ceo_group_is_system_slug(text) from public;
grant execute on function public.portal_ceo_group_is_system_slug(text) to authenticated;

drop policy if exists portal_ceo_group_insert_lead_programme on public.portal_ceo_group;
create policy portal_ceo_group_insert_lead_programme
  on public.portal_ceo_group
  for insert
  to authenticated
  with check (
    public.portal_staff_profile_is_lead_only_messenger()
    and not public.portal_ceo_group_is_system_slug(slug)
  );

drop policy if exists portal_ceo_group_select_lead_programme on public.portal_ceo_group;
create policy portal_ceo_group_select_lead_programme
  on public.portal_ceo_group
  for select
  to authenticated
  using (
    public.portal_staff_profile_is_lead_only_messenger()
    and not public.portal_ceo_group_is_system_slug(slug)
  );

drop policy if exists portal_ceo_group_message_select_lead_programme on public.portal_ceo_group_message;
create policy portal_ceo_group_message_select_lead_programme
  on public.portal_ceo_group_message
  for select
  to authenticated
  using (
    public.portal_staff_profile_is_lead_only_messenger()
    and exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and not public.portal_ceo_group_is_system_slug(g.slug)
    )
  );

drop policy if exists portal_ceo_group_message_insert_lead_programme on public.portal_ceo_group_message;
create policy portal_ceo_group_message_insert_lead_programme
  on public.portal_ceo_group_message
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.portal_staff_profile_is_lead_only_messenger()
    and exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and not public.portal_ceo_group_is_system_slug(g.slug)
    )
  );

commit;
