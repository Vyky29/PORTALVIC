-- Session leads channel: group chat + group calls for programme leads only (not all staff).
-- Admins/CEO use this like a Cliq channel; regular staff cannot see it.

begin;

insert into public.portal_ceo_group (slug, title)
values ('session_leads', 'Session leads')
on conflict (slug) do update set title = excluded.title;

drop policy if exists portal_ceo_group_select_session_leads on public.portal_ceo_group;
create policy portal_ceo_group_select_session_leads
  on public.portal_ceo_group
  for select
  to authenticated
  using (
    slug = 'session_leads'
    and (
      public.portal_staff_profile_is_admin_or_ceo()
      or exists (
        select 1
        from public.staff_profiles sp
        where sp.id = (select auth.uid())
          and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'lead'
          and coalesce(sp.is_active, true)
      )
    )
  );

drop policy if exists portal_ceo_group_message_select_session_leads on public.portal_ceo_group_message;
create policy portal_ceo_group_message_select_session_leads
  on public.portal_ceo_group_message
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'session_leads'
    )
    and (
      public.portal_staff_profile_is_admin_or_ceo()
      or exists (
        select 1
        from public.staff_profiles sp
        where sp.id = (select auth.uid())
          and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'lead'
          and coalesce(sp.is_active, true)
      )
    )
  );

drop policy if exists portal_ceo_group_message_insert_session_leads on public.portal_ceo_group_message;
create policy portal_ceo_group_message_insert_session_leads
  on public.portal_ceo_group_message
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'session_leads'
    )
    and (
      public.portal_staff_profile_is_admin_or_ceo()
      or exists (
        select 1
        from public.staff_profiles sp
        where sp.id = (select auth.uid())
          and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'lead'
          and coalesce(sp.is_active, true)
      )
    )
  );

comment on table public.portal_ceo_group is
  'Shared group threads: CEO circles, Staff & leads ops ring (legacy), and Session leads channel.';

commit;
