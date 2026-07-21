-- Planner access (visualVIC): expand slugs + reseat assignments + full-access flag.
-- Source of truth from product owner (Jul 2026):
--   Limited: Alex/Andres/Carlos → climbing+core; Bismark → climbing+tinashe+core;
--            Sandra → fitness+ayaan+serine+core; Giuseppe/Godsway/John → tinashe+core;
--            Roberto → fadi+core; Luliya → ikram+core; Youssef → fadi+emanuel+core.
--   Full project: Michelle, Victor, Raul, Palankas (username Javi).

begin;

alter table public.staff_profiles
  add column if not exists planner_full_access boolean not null default false;

comment on column public.staff_profiles.planner_full_access is
  'When true, visualVIC Planner grants the full library (no staff_participant_access filter).';

-- Widen allowed pack / participant slugs (services + tailored participants).
alter table public.staff_participant_access
  drop constraint if exists staff_participant_access_participant_slug_check;

alter table public.staff_participant_access
  add constraint staff_participant_access_participant_slug_check
  check (
    participant_slug in (
      'ikram',
      'serine',
      'ayaan',
      'emanuel',
      'tinashe',
      'fadi',
      'core',
      'climbing',
      'fitness'
    )
  );

-- Full-access staff: clear tailored rows and flag.
update public.staff_profiles
set planner_full_access = true
where is_active = true
  and lower(trim(coalesce(username, ''))) in ('michelle', 'victor', 'raul', 'javi');

delete from public.staff_participant_access spa
using public.staff_profiles sp
where spa.staff_id = sp.id
  and lower(trim(coalesce(sp.username, ''))) in ('michelle', 'victor', 'raul', 'javi');

-- Limited staff: replace assignments from the product list.
delete from public.staff_participant_access spa
using public.staff_profiles sp
where spa.staff_id = sp.id
  and lower(trim(coalesce(sp.username, ''))) in (
    'alex',
    'andres',
    'bismark',
    'carlos',
    'sandra',
    'giuseppe',
    'godsway',
    'john',
    'roberto',
    'luliya',
    'lulia',
    'youssef'
  );

insert into public.staff_participant_access (staff_id, participant_slug)
select sp.id, v.slug
from public.staff_profiles sp
cross join (values ('climbing'), ('core')) as v(slug)
where sp.is_active = true
  and lower(trim(coalesce(sp.username, ''))) in ('alex', 'andres', 'carlos')
on conflict do nothing;

insert into public.staff_participant_access (staff_id, participant_slug)
select sp.id, v.slug
from public.staff_profiles sp
cross join (values ('climbing'), ('tinashe'), ('core')) as v(slug)
where sp.is_active = true
  and lower(trim(coalesce(sp.username, ''))) = 'bismark'
on conflict do nothing;

insert into public.staff_participant_access (staff_id, participant_slug)
select sp.id, v.slug
from public.staff_profiles sp
cross join (values ('fitness'), ('ayaan'), ('serine'), ('core')) as v(slug)
where sp.is_active = true
  and lower(trim(coalesce(sp.username, ''))) = 'sandra'
on conflict do nothing;

insert into public.staff_participant_access (staff_id, participant_slug)
select sp.id, v.slug
from public.staff_profiles sp
cross join (values ('tinashe'), ('core')) as v(slug)
where sp.is_active = true
  and lower(trim(coalesce(sp.username, ''))) in ('giuseppe', 'godsway', 'john')
on conflict do nothing;

insert into public.staff_participant_access (staff_id, participant_slug)
select sp.id, v.slug
from public.staff_profiles sp
cross join (values ('fadi'), ('core')) as v(slug)
where sp.is_active = true
  and lower(trim(coalesce(sp.username, ''))) = 'roberto'
on conflict do nothing;

insert into public.staff_participant_access (staff_id, participant_slug)
select sp.id, v.slug
from public.staff_profiles sp
cross join (values ('ikram'), ('core')) as v(slug)
where sp.is_active = true
  and lower(trim(coalesce(sp.username, ''))) in ('luliya', 'lulia')
on conflict do nothing;

insert into public.staff_participant_access (staff_id, participant_slug)
select sp.id, v.slug
from public.staff_profiles sp
cross join (values ('fadi'), ('emanuel'), ('core')) as v(slug)
where sp.is_active = true
  and lower(trim(coalesce(sp.username, ''))) = 'youssef'
on conflict do nothing;

-- Ensure limited planners stay staff/lead (not inactive); John stays lead.
update public.staff_profiles
set planner_full_access = false
where is_active = true
  and lower(trim(coalesce(username, ''))) in (
    'alex',
    'andres',
    'bismark',
    'carlos',
    'sandra',
    'giuseppe',
    'godsway',
    'john',
    'roberto',
    'luliya',
    'lulia',
    'youssef'
  );

commit;
