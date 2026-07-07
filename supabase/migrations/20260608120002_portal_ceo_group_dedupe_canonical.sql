-- Merge duplicate portal_ceo_group rows that represent the same logical channel
-- (e.g. multiple rows titled like "CEOs — Raúl · Victor · Javi" with non-canonical slugs).
-- Keeps the canonical slug row and repoints messages before deleting duplicates.

begin;

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
      lower(coalesce(g.title, '')) ~ 'all\s*ceos'
      or lower(coalesce(g.title, '')) ~ 'ceos.*raul.*victor.*javi'
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
      lower(coalesce(g.title, '')) ~ 'all\s*ceos'
      or lower(coalesce(g.title, '')) ~ 'ceos.*raul.*victor.*javi'
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
      lower(coalesce(g.title, '')) ~ 'ceo\s*liaison'
      or lower(coalesce(g.title, '')) ~ 'ceos.*sevitha'
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
      lower(coalesce(g.title, '')) ~ 'ceo\s*liaison'
      or lower(coalesce(g.title, '')) ~ 'ceos.*sevitha'
    )
)
delete from public.portal_ceo_group g
where g.id in (select id from dupes);

commit;
