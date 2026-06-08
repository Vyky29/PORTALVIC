-- Staff pool channels (Swimming / Climbing / Support / Leads) + stronger CEO group dedupe (accent-safe titles).

begin;

insert into public.portal_ceo_group (slug, title)
values
  ('all_ceos', 'All CEOs (group)'),
  ('ceo_liaison', 'CEO & Ops liaison (group)'),
  ('swimming_instructors', 'Swimming Instructors'),
  ('climbing_instructors', 'Climbing Instructors'),
  ('support_staff', 'Support Staff'),
  ('pool_leads', 'Leads')
on conflict (slug) do update set title = excluded.title;

-- Normalize titles for pattern matching (strip accents).
create or replace function public.portal_ceo_group_title_norm(t text)
returns text
language sql
immutable
as $$
  select lower(
    translate(
      coalesce(t, ''),
      'áàäâãåéèëêíìïîóòöôõúùüûñç',
      'aaaaaaeeeeiiiiooooouuuunc'
    )
  );
$$;

-- Internal CEO ring → all_ceos
with keeper as (
  select id
  from public.portal_ceo_group
  where slug = 'all_ceos'
  order by updated_at desc
  limit 1
),
dupes as (
  select g.id
  from public.portal_ceo_group g
  where g.slug <> 'all_ceos'
    and (
      public.portal_ceo_group_title_norm(g.title) ~ 'all\s*ceos'
      or public.portal_ceo_group_title_norm(g.title) ~ 'ceos.*raul.*victor.*javi'
    )
)
update public.portal_ceo_group_message m
set group_id = (select id from keeper)
where exists (select 1 from keeper)
  and m.group_id in (select id from dupes);

with dupes as (
  select g.id
  from public.portal_ceo_group g
  where g.slug <> 'all_ceos'
    and (
      public.portal_ceo_group_title_norm(g.title) ~ 'all\s*ceos'
      or public.portal_ceo_group_title_norm(g.title) ~ 'ceos.*raul.*victor.*javi'
    )
)
delete from public.portal_ceo_group g
where g.id in (select id from dupes);

-- CEOs & Sevitha liaison → ceo_liaison
with keeper as (
  select id
  from public.portal_ceo_group
  where slug = 'ceo_liaison'
  order by updated_at desc
  limit 1
),
dupes as (
  select g.id
  from public.portal_ceo_group g
  where g.slug <> 'ceo_liaison'
    and (
      public.portal_ceo_group_title_norm(g.title) ~ 'ceo\s*liaison'
      or public.portal_ceo_group_title_norm(g.title) ~ 'ceos.*sevitha'
    )
)
update public.portal_ceo_group_message m
set group_id = (select id from keeper)
where exists (select 1 from keeper)
  and m.group_id in (select id from dupes);

with dupes as (
  select g.id
  from public.portal_ceo_group g
  where g.slug <> 'ceo_liaison'
    and (
      public.portal_ceo_group_title_norm(g.title) ~ 'ceo\s*liaison'
      or public.portal_ceo_group_title_norm(g.title) ~ 'ceos.*sevitha'
    )
)
delete from public.portal_ceo_group g
where g.id in (select id from dupes);

-- Swimming Instructors
drop policy if exists portal_ceo_group_select_swimming_instructors on public.portal_ceo_group;
create policy portal_ceo_group_select_swimming_instructors
  on public.portal_ceo_group
  for select
  to authenticated
  using (
    slug = 'swimming_instructors'
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'staff'
        and lower(coalesce(nullif(trim(sp.staff_role), ''), '')) = 'swimming'
        and coalesce(sp.is_active, true)
    )
  );

drop policy if exists portal_ceo_group_message_select_swimming_instructors on public.portal_ceo_group_message;
create policy portal_ceo_group_message_select_swimming_instructors
  on public.portal_ceo_group_message
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'swimming_instructors'
    )
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'staff'
        and lower(coalesce(nullif(trim(sp.staff_role), ''), '')) = 'swimming'
        and coalesce(sp.is_active, true)
    )
  );

drop policy if exists portal_ceo_group_message_insert_swimming_instructors on public.portal_ceo_group_message;
create policy portal_ceo_group_message_insert_swimming_instructors
  on public.portal_ceo_group_message
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'swimming_instructors'
    )
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'staff'
        and lower(coalesce(nullif(trim(sp.staff_role), ''), '')) = 'swimming'
        and coalesce(sp.is_active, true)
    )
  );

-- Climbing Instructors
drop policy if exists portal_ceo_group_select_climbing_instructors on public.portal_ceo_group;
create policy portal_ceo_group_select_climbing_instructors
  on public.portal_ceo_group
  for select
  to authenticated
  using (
    slug = 'climbing_instructors'
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'staff'
        and lower(coalesce(nullif(trim(sp.staff_role), ''), '')) = 'climbing'
        and coalesce(sp.is_active, true)
    )
  );

drop policy if exists portal_ceo_group_message_select_climbing_instructors on public.portal_ceo_group_message;
create policy portal_ceo_group_message_select_climbing_instructors
  on public.portal_ceo_group_message
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'climbing_instructors'
    )
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'staff'
        and lower(coalesce(nullif(trim(sp.staff_role), ''), '')) = 'climbing'
        and coalesce(sp.is_active, true)
    )
  );

drop policy if exists portal_ceo_group_message_insert_climbing_instructors on public.portal_ceo_group_message;
create policy portal_ceo_group_message_insert_climbing_instructors
  on public.portal_ceo_group_message
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'climbing_instructors'
    )
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'staff'
        and lower(coalesce(nullif(trim(sp.staff_role), ''), '')) = 'climbing'
        and coalesce(sp.is_active, true)
    )
  );

-- Support Staff
drop policy if exists portal_ceo_group_select_support_staff on public.portal_ceo_group;
create policy portal_ceo_group_select_support_staff
  on public.portal_ceo_group
  for select
  to authenticated
  using (
    slug = 'support_staff'
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'staff'
        and lower(coalesce(nullif(trim(sp.staff_role), ''), '')) = 'support'
        and coalesce(sp.is_active, true)
    )
  );

drop policy if exists portal_ceo_group_message_select_support_staff on public.portal_ceo_group_message;
create policy portal_ceo_group_message_select_support_staff
  on public.portal_ceo_group_message
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'support_staff'
    )
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'staff'
        and lower(coalesce(nullif(trim(sp.staff_role), ''), '')) = 'support'
        and coalesce(sp.is_active, true)
    )
  );

drop policy if exists portal_ceo_group_message_insert_support_staff on public.portal_ceo_group_message;
create policy portal_ceo_group_message_insert_support_staff
  on public.portal_ceo_group_message
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'support_staff'
    )
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'staff'
        and lower(coalesce(nullif(trim(sp.staff_role), ''), '')) = 'support'
        and coalesce(sp.is_active, true)
    )
  );

-- Leads (pool leads channel under Staff tab for admin; app_role lead on worker side)
drop policy if exists portal_ceo_group_select_pool_leads on public.portal_ceo_group;
create policy portal_ceo_group_select_pool_leads
  on public.portal_ceo_group
  for select
  to authenticated
  using (
    slug = 'pool_leads'
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'lead'
        and coalesce(sp.is_active, true)
    )
  );

drop policy if exists portal_ceo_group_message_select_pool_leads on public.portal_ceo_group_message;
create policy portal_ceo_group_message_select_pool_leads
  on public.portal_ceo_group_message
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'pool_leads'
    )
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'lead'
        and coalesce(sp.is_active, true)
    )
  );

drop policy if exists portal_ceo_group_message_insert_pool_leads on public.portal_ceo_group_message;
create policy portal_ceo_group_message_insert_pool_leads
  on public.portal_ceo_group_message
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.portal_ceo_group g
      where g.id = group_id
        and g.slug = 'pool_leads'
    )
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) = 'lead'
        and coalesce(sp.is_active, true)
    )
  );

comment on table public.portal_ceo_group is
  'Shared group threads: CEO circles, liaison, session leads, staff pool channels (swimming/climbing/support/leads), and legacy ops rings.';

commit;
