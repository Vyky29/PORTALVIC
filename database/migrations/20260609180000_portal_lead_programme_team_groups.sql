-- Programme team groups per service + session-leads ring (John/Berta/Michelle only).

begin;

insert into public.portal_ceo_group (slug, title)
values
  ('lead_team_john_bespoke', 'Bespoke programme'),
  ('lead_team_john_sunday_ma', 'Sunday Multi-Activity'),
  ('lead_team_berta_ma', 'Multi-Activity team'),
  ('lead_team_michelle', 'Day Centre team'),
  ('session_leads', 'Session leads')
on conflict (slug) do update set title = excluded.title;

create or replace function public.portal_ceo_group_is_lead_team_slug(slug text)
returns boolean
language sql
immutable
as $$
  select coalesce(lower(trim(slug)), '') in (
    'lead_team_john_bespoke',
    'lead_team_john_sunday_ma',
    'lead_team_berta_ma',
    'lead_team_michelle',
    'session_leads'
  );
$$;

drop policy if exists portal_ceo_group_select_lead_teams on public.portal_ceo_group;
create policy portal_ceo_group_select_lead_teams
  on public.portal_ceo_group
  for select
  to authenticated
  using (
    public.portal_ceo_group_is_lead_team_slug(slug)
    and (
      public.portal_staff_profile_is_admin_or_ceo()
      or public.portal_staff_is_staff_or_lead()
    )
  );

drop policy if exists portal_ceo_group_message_select_lead_teams on public.portal_ceo_group_message;
create policy portal_ceo_group_message_select_lead_teams
  on public.portal_ceo_group_message
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and public.portal_ceo_group_is_lead_team_slug(g.slug)
    )
    and (
      public.portal_staff_profile_is_admin_or_ceo()
      or public.portal_staff_is_staff_or_lead()
    )
  );

drop policy if exists portal_ceo_group_message_insert_lead_teams on public.portal_ceo_group_message;
create policy portal_ceo_group_message_insert_lead_teams
  on public.portal_ceo_group_message
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and public.portal_ceo_group_is_lead_team_slug(g.slug)
    )
    and (
      public.portal_staff_profile_is_admin_or_ceo()
      or public.portal_staff_is_staff_or_lead()
    )
  );

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
    'staff_leads_ops',
    'swimming_instructors',
    'climbing_instructors',
    'support_staff',
    'pool_leads',
    'staff_worker_mgmt',
    'lead_team_john_bespoke',
    'lead_team_john_sunday_ma',
    'lead_team_berta_ma',
    'lead_team_michelle',
    'session_leads'
  );
$$;

comment on table public.portal_ceo_group is
  'Group threads: CEO circles, programme lead teams (lead_team_*), session_leads ring, legacy pools.';

commit;
