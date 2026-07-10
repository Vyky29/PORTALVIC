-- ISP: service-scoped general library + per-participant plans + fork-on-edit metadata.

begin;

-- ─── Library: scope + service tags + fork provenance ─────────────────────────
alter table public.portal_isp_behaviour_library
  add column if not exists scope text not null default 'general',
  add column if not exists service_tags text[] not null default array['all']::text[],
  add column if not exists forked_from_id uuid null
    references public.portal_isp_behaviour_library (id) on delete set null,
  add column if not exists created_by uuid null references auth.users (id) on delete set null;

alter table public.portal_isp_behaviour_library
  drop constraint if exists portal_isp_behaviour_library_scope_check;
alter table public.portal_isp_behaviour_library
  add constraint portal_isp_behaviour_library_scope_check
  check (scope in ('general', 'individual'));

alter table public.portal_isp_strategy_library
  add column if not exists scope text not null default 'general',
  add column if not exists service_tags text[] not null default array['all']::text[],
  add column if not exists forked_from_id uuid null
    references public.portal_isp_strategy_library (id) on delete set null,
  add column if not exists created_by uuid null references auth.users (id) on delete set null;

alter table public.portal_isp_strategy_library
  drop constraint if exists portal_isp_strategy_library_scope_check;
alter table public.portal_isp_strategy_library
  add constraint portal_isp_strategy_library_scope_check
  check (scope in ('general', 'individual'));

comment on column public.portal_isp_behaviour_library.scope is
  'general = service-filtered defaults for all matching participants; individual = staff-added / forked templates.';
comment on column public.portal_isp_behaviour_library.service_tags is
  'Tags such as all, swimming, climbing, fitness, outing, indoor. Empty or all = every participant.';

-- ─── Plan items: general vs individual + customization flag ──────────────────
alter table public.portal_support_plan_items
  add column if not exists item_scope text not null default 'individual',
  add column if not exists is_customized boolean not null default false,
  add column if not exists service_tags text[] not null default '{}'::text[];

alter table public.portal_support_plan_items
  drop constraint if exists portal_support_plan_items_scope_check;
alter table public.portal_support_plan_items
  add constraint portal_support_plan_items_scope_check
  check (item_scope in ('general', 'individual'));

create index if not exists portal_isp_behaviour_library_scope_idx
  on public.portal_isp_behaviour_library (scope, sort_order)
  where is_active;

create index if not exists portal_isp_strategy_library_scope_idx
  on public.portal_isp_strategy_library (scope, sort_order)
  where is_active;

create index if not exists portal_support_plan_items_scope_idx
  on public.portal_support_plan_items (plan_id, item_scope, item_status);

-- ─── Tag seeded general behaviours by service ────────────────────────────────
update public.portal_isp_behaviour_library set scope = 'general', service_tags = array['outing']::text[], updated_at = now()
where code in (
  'pupils_going_missing',
  'running_away_getting_lost',
  'running_away_from_adults',
  'inappropriate_public_behaviour',
  'inappropriate_public_towards_child',
  'rushing_pushing',
  'inclement_weather'
);

update public.portal_isp_behaviour_library set scope = 'general', service_tags = array['swimming']::text[], updated_at = now()
where code in (
  'leaving_pool_area',
  'poolside_running',
  'water_refusal_or_fear',
  'ripping_wet_clothes'
);

update public.portal_isp_behaviour_library set scope = 'general', service_tags = array['climbing']::text[], updated_at = now()
where code in (
  'climbing_height_anxiety',
  'climbing_unsafe_descent'
);

update public.portal_isp_behaviour_library set scope = 'general', service_tags = array['all']::text[], updated_at = now()
where code in (
  'sensory_processing_overload',
  'loud_noise_distress',
  'high_arousal_excitement',
  'loud_high_pitched_noise',
  'non_aggressive_slapping',
  'injury',
  'accidental_injuries',
  'child_distressed_anxious',
  'dysregulated_needs_space',
  'removing_clothes_dysregulated',
  'toileting_accidents',
  'transition_difficulties',
  'fixation_preferred_item',
  'refusal_to_engage',
  'aggression_to_peers_staff',
  'self_injurious_behaviour'
);

-- Strategies: inherit tags from primary behaviour category / codes
update public.portal_isp_strategy_library s
set
  scope = 'general',
  service_tags = coalesce((
    select b.service_tags
    from public.portal_isp_behaviour_library b
    where b.code = any (s.behaviour_codes)
    order by case when 'all' = any (b.service_tags) then 1 else 0 end
    limit 1
  ), array['all']::text[]),
  updated_at = now()
where s.scope is distinct from 'individual';

-- Pool / climbing strategy overrides
update public.portal_isp_strategy_library set service_tags = array['swimming']::text[], updated_at = now()
where code in ('big_pool_only_staff_exit', 'slow_down_verbal_cues');

update public.portal_isp_strategy_library set service_tags = array['climbing']::text[], updated_at = now()
where code in ('climbing_spotting_safe_descent');

update public.portal_isp_strategy_library set service_tags = array['outing']::text[], updated_at = now()
where code in (
  'high_ratio_headcounts',
  'link_arms_follow_allocation',
  'hold_hands_younger',
  'one_to_one_distract_model',
  'report_public_welfare',
  'weather_contingency'
);

commit;
