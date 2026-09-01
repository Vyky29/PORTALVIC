-- Uniform kit allocation tiers by staff (Day Centre / Bespoke / support / swimming).
-- Offers: kit_2x2 = 2 T-shirts + 2 sweatshirts; kit_1x1 = 1+1; kit_none = swimming (for now).

alter table public.staff_profiles
  add column if not exists uniform_kit_tier text;

alter table public.staff_profiles
  drop constraint if exists staff_profiles_uniform_kit_tier_check;

alter table public.staff_profiles
  add constraint staff_profiles_uniform_kit_tier_check
  check (
    uniform_kit_tier is null
    or uniform_kit_tier in ('kit_2x2', 'kit_1x1', 'kit_none', 'kit_manager')
  );

comment on column public.staff_profiles.uniform_kit_tier is
  'Uniform initial offer: kit_2x2 (Day Centre/Bespoke), kit_1x1 (zero-hours support), kit_none (swimming), kit_manager (polos as needed). Null = derive from role + username defaults.';

-- Explicit seeds (username match, case-insensitive)
update public.staff_profiles
set uniform_kit_tier = 'kit_2x2'
where lower(trim(username)) in (
  -- Bespoke Programme
  'john', 'godsway', 'emanuel', 'emmanuel',
  -- Day Centre (programme leads / DC cover — extend as new DC staff join)
  'michelle'
);

update public.staff_profiles
set uniform_kit_tier = 'kit_1x1'
where lower(trim(username)) in (
  -- Zero-hours support workers
  'carlos', 'alex', 'berta', 'bismark', 'giuseppe'
);

update public.staff_profiles
set uniform_kit_tier = 'kit_none'
where lower(coalesce(staff_role, '')) = 'swimming'
  and uniform_kit_tier is null;

-- Managers / admin: no auto grey kit (issue manager polos manually when needed)
update public.staff_profiles
set uniform_kit_tier = 'kit_manager'
where uniform_kit_tier is null
  and (
    lower(coalesce(app_role, '')) in ('admin', 'ceo')
    or lower(coalesce(staff_role, '')) in ('manager', 'admin')
  );

-- Remaining support workers (zero-hours style) default to 1+1 when still unset
update public.staff_profiles
set uniform_kit_tier = 'kit_1x1'
where uniform_kit_tier is null
  and lower(coalesce(staff_role, '')) = 'support';
