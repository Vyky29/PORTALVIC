-- Fixed CS Cliq CEO channels:
--   all_ceos     - Raul, Victor, Javier Arranz (Palan) only
--   ceo_liaison  - executive trio + Sevitha

begin;

create or replace function public.portal_profile_is_executive_trio_member()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and coalesce(sp.is_active, true)
      and (
        public.portal_profile_staff_key(sp.id) in ('raul', 'victor', 'javi', 'javier')
        or lower(coalesce(sp.username, '')) in ('raul', 'victor', 'javi', 'javier')
        or lower(split_part(trim(coalesce(sp.full_name, '')), ' ', 1)) in ('raul', 'victor', 'javi', 'javier')
        or lower(coalesce(sp.username, '')) like '%palan%'
        or lower(coalesce(sp.full_name, '')) like '%palan%'
        or lower(coalesce(sp.full_name, '')) like '%arranz%'
      )
  );
$$;

comment on function public.portal_profile_is_executive_trio_member() is
  'Raúl, Victor, Javier Arranz (Palan) — fixed CEO-only Cliq channel membership.';

create or replace function public.portal_profile_is_ceo_ops_ring_member()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security to off
as $$
  select public.portal_profile_is_executive_trio_member()
    or public.portal_profile_staff_key((select auth.uid())) = 'sevitha'
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and coalesce(sp.is_active, true)
        and lower(coalesce(sp.username, '')) in ('sevitha', 'info')
    );
$$;

comment on function public.portal_profile_is_ceo_ops_ring_member() is
  'Executive trio plus Sevitha — fixed CEOs & Ops Cliq channel membership.';

create or replace function public.portal_ceo_group_slug_can_access(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security to off
as $$
  select case lower(trim(coalesce(p_slug, '')))
    when 'all_ceos' then public.portal_profile_is_executive_trio_member()
    when 'ceo_liaison' then public.portal_profile_is_ceo_ops_ring_member()
    when 'staff_leads_ops' then public.portal_staff_is_staff_or_lead()
    when 'session_leads' then (
      public.portal_staff_profile_is_admin_or_ceo()
      or exists (
        select 1
        from public.staff_profiles sp
        where sp.id = (select auth.uid())
          and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'lead'
          and coalesce(sp.is_active, true)
      )
    )
    else public.portal_staff_profile_is_admin_or_ceo()
  end;
$$;

comment on function public.portal_ceo_group_slug_can_access(text) is
  'Per-slug membership for portal_ceo_group rows (executive trio, CEOs+Sevitha, leads channels, etc.).';

revoke all on function public.portal_profile_is_executive_trio_member() from public;
grant execute on function public.portal_profile_is_executive_trio_member() to authenticated;

revoke all on function public.portal_profile_is_ceo_ops_ring_member() from public;
grant execute on function public.portal_profile_is_ceo_ops_ring_member() to authenticated;

revoke all on function public.portal_ceo_group_slug_can_access(text) from public;
grant execute on function public.portal_ceo_group_slug_can_access(text) to authenticated;

insert into public.portal_ceo_group (slug, title)
values
  ('all_ceos', 'CEOs — Raúl · Victor · Javier'),
  ('ceo_liaison', 'CEOs & Sevitha')
on conflict (slug) do update
  set title = excluded.title;

drop policy if exists "portal_ceo_group_select_admin_ceo" on public.portal_ceo_group;
drop policy if exists "portal_ceo_group_select_member" on public.portal_ceo_group;

create policy "portal_ceo_group_select_member"
  on public.portal_ceo_group
  for select
  to authenticated
  using (public.portal_ceo_group_slug_can_access(slug));

drop policy if exists "portal_ceo_group_message_select_admin_ceo" on public.portal_ceo_group_message;
drop policy if exists "portal_ceo_group_message_select_member" on public.portal_ceo_group_message;

create policy "portal_ceo_group_message_select_member"
  on public.portal_ceo_group_message
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and public.portal_ceo_group_slug_can_access(g.slug)
    )
  );

drop policy if exists "portal_ceo_group_message_insert_admin_ceo" on public.portal_ceo_group_message;
drop policy if exists "portal_ceo_group_message_insert_member" on public.portal_ceo_group_message;

create policy "portal_ceo_group_message_insert_member"
  on public.portal_ceo_group_message
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and public.portal_ceo_group_slug_can_access(g.slug)
    )
  );

comment on table public.portal_ceo_group is
  'Fixed Cliq group threads: CEOs trio (all_ceos), CEOs+Sevitha (ceo_liaison), session leads, staff ops ring.';

commit;
