-- Behaviour + strategy libraries for Individual Support Plans.
-- Seeded from general educational-visit / class RA patterns (not fake named pupils).
-- Support plan review: reviewed by instructor, approved by admin/ceo.

begin;

-- ─── Support plan review metadata ───────────────────────────────────────────
alter table public.portal_support_plans
  add column if not exists reviewed_by uuid null references auth.users (id) on delete set null,
  add column if not exists reviewed_by_name text null,
  add column if not exists reviewed_at timestamptz null,
  add column if not exists approved_by uuid null references auth.users (id) on delete set null,
  add column if not exists approved_by_name text null,
  add column if not exists approved_at timestamptz null;

comment on column public.portal_support_plans.reviewed_by is
  'Primary instructor who reviewed the plan.';
comment on column public.portal_support_plans.approved_by is
  'Admin/CEO who approved the plan for use.';

-- ─── Behaviour library ──────────────────────────────────────────────────────
create table if not exists public.portal_isp_behaviour_library (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  code text not null,
  label text not null,
  category text not null default 'general',
  default_risk_level text not null default 'medium',
  sort_order int not null default 100,
  is_active boolean not null default true,
  constraint portal_isp_behaviour_library_code_uidx unique (code),
  constraint portal_isp_behaviour_library_risk_check
    check (default_risk_level in ('high', 'medium', 'low'))
);

create index if not exists portal_isp_behaviour_library_cat_idx
  on public.portal_isp_behaviour_library (category, sort_order)
  where is_active;

-- ─── Strategy library ───────────────────────────────────────────────────────
create table if not exists public.portal_isp_strategy_library (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  code text not null,
  label text not null,
  body text not null,
  category text not null default 'general',
  -- optional: which behaviour codes this strategy commonly pairs with
  behaviour_codes text[] not null default '{}',
  sort_order int not null default 100,
  is_active boolean not null default true,
  constraint portal_isp_strategy_library_code_uidx unique (code)
);

create index if not exists portal_isp_strategy_library_cat_idx
  on public.portal_isp_strategy_library (category, sort_order)
  where is_active;

-- Link rows on follow-up strategies / plan items (optional provenance)
alter table public.portal_incident_followup_strategies
  add column if not exists behaviour_library_id uuid null
    references public.portal_isp_behaviour_library (id) on delete set null,
  add column if not exists strategy_library_id uuid null
    references public.portal_isp_strategy_library (id) on delete set null;

alter table public.portal_support_plan_items
  add column if not exists behaviour_library_id uuid null
    references public.portal_isp_behaviour_library (id) on delete set null,
  add column if not exists strategy_library_id uuid null
    references public.portal_isp_strategy_library (id) on delete set null;

-- ─── Seed behaviours (from general RA patterns + club-relevant extras) ──────
insert into public.portal_isp_behaviour_library
  (code, label, category, default_risk_level, sort_order)
values
  -- Safety / absconding (Educational visit RA)
  ('pupils_going_missing', 'Pupils going missing', 'safety', 'high', 10),
  ('running_away_getting_lost', 'Running away / getting lost', 'safety', 'high', 20),
  ('running_away_from_adults', 'Running away from adults', 'safety', 'high', 30),
  -- Sensory / regulation
  ('sensory_processing_overload', 'Sensory / processing overload', 'sensory', 'medium', 40),
  ('loud_noise_distress', 'Distress or shouting due to loud noise', 'sensory', 'high', 50),
  ('high_arousal_excitement', 'Very high arousal / animated or excited', 'sensory', 'medium', 60),
  ('loud_high_pitched_noise', 'Making loud high-pitched noise', 'sensory', 'medium', 70),
  -- Public / social behaviour
  ('inappropriate_public_behaviour', 'Contextually inappropriate behaviour towards members of the public', 'public', 'medium', 80),
  ('inappropriate_public_towards_child', 'Inappropriate behaviour from members of the public', 'public', 'low', 90),
  ('rushing_pushing', 'Rushing / pushing people out of the way', 'public', 'medium', 100),
  ('non_aggressive_slapping', 'Non-aggressive slapping / chest tapping when excited', 'public', 'medium', 110),
  -- Injury / first aid
  ('injury', 'Injury', 'injury', 'low', 120),
  ('accidental_injuries', 'Accidental injuries', 'injury', 'medium', 130),
  -- Environment
  ('inclement_weather', 'Inclement weather affecting travel or outdoor activities', 'environment', 'low', 140),
  -- Distress
  ('child_distressed_anxious', 'Child distressed or anxious', 'distress', 'low', 150),
  ('dysregulated_needs_space', 'Dysregulated and needs space / higher ratio', 'distress', 'medium', 160),
  -- Personal care (generic patterns — not named pupils)
  ('removing_clothes_dysregulated', 'Removing clothes when dysregulated', 'personal_care', 'medium', 170),
  ('ripping_wet_clothes', 'Ripping clothes when wet / in wet environments', 'personal_care', 'medium', 180),
  ('toileting_accidents', 'Toileting accidents (floor or clothes)', 'personal_care', 'medium', 190),
  -- ClubSENsational / pool / climbing extras
  ('leaving_pool_area', 'Leaving pool area / exit seeking', 'pool', 'high', 200),
  ('poolside_running', 'Running on poolside', 'pool', 'high', 210),
  ('water_refusal_or_fear', 'Water refusal or fear in pool', 'pool', 'medium', 220),
  ('transition_difficulties', 'Transition difficulties between activities', 'transitions', 'medium', 230),
  ('fixation_preferred_item', 'Fixation with preferred item (e.g. device / motivator)', 'transitions', 'medium', 240),
  ('climbing_height_anxiety', 'Anxiety at height / on wall', 'climbing', 'medium', 250),
  ('climbing_unsafe_descent', 'Unsafe descent or letting go on wall', 'climbing', 'high', 260),
  ('refusal_to_engage', 'Refusal to engage with planned activity', 'engagement', 'low', 270),
  ('aggression_to_peers_staff', 'Aggression towards peers or staff', 'safety', 'high', 280),
  ('self_injurious_behaviour', 'Self-injurious behaviour', 'safety', 'high', 290)
on conflict (code) do update set
  label = excluded.label,
  category = excluded.category,
  default_risk_level = excluded.default_risk_level,
  sort_order = excluded.sort_order,
  updated_at = now(),
  is_active = true;

-- ─── Seed strategies ────────────────────────────────────────────────────────
insert into public.portal_isp_strategy_library
  (code, label, body, category, behaviour_codes, sort_order)
values
  ('high_ratio_headcounts',
   'High ratio + head counts',
   'High staff to student ratio. Regular head counts. Groupings for staff and students clear and all parties made aware of arrangements. If a child goes missing call school & police immediately.',
   'safety', array['pupils_going_missing','running_away_getting_lost'], 10),
  ('link_arms_follow_allocation',
   'Link arms / follow allocation',
   'High staff to student ratio. Adults to follow staff/student allocation. If needed link arms with students or walk beside them at all times. Regular head counts.',
   'safety', array['running_away_getting_lost','running_away_from_adults'], 20),
  ('hold_hands_younger',
   'Hold hands with staff',
   'All children to hold hands with staff members (especially younger children). Maintain visual contact and clear adult allocation.',
   'safety', array['running_away_from_adults'], 30),
  ('sensory_kit_low_arousal',
   'Sensory kit + low-arousal approach',
   'Ear defenders, chewy tubes, and sensory distracters to be available. Break card available. Offer deep pressure / a break where appropriate. Use calm, low-arousal, reassuring voice and behaviour. Reduce verbal input, give time and space to process, follow strategies as per Emotional Regulation support plans. Distract/redirect where possible. Use physical intervention only if a danger is posed. If student not coping, arrangements can be made for collection; one team member leaves with student to ensure safe return.',
   'sensory', array['sensory_processing_overload','loud_noise_distress','loud_high_pitched_noise','high_arousal_excitement'], 40),
  ('quiet_space_guide',
   'Guide to quieter space',
   'Support the participant to access quieter spaces. An adult guides them to a calm room or low-stimulus area and helps them move safely if they need more space.',
   'sensory', array['loud_noise_distress','dysregulated_needs_space'], 50),
  ('calming_preferred_activities',
   'Calming / preferred activities',
   'Offer calming activities such as quiet time, sensory items, cutting paper, puzzles or a familiar activity to help settle and stay engaged.',
   'sensory', array['high_arousal_excitement','loud_high_pitched_noise'], 60),
  ('model_gentle_hands',
   'Acknowledge excitement + gentle hands',
   'Acknowledge excitement and guide to a calmer activity while modelling gentle hands. Engage with preferred activities to keep busy.',
   'public', array['non_aggressive_slapping'], 70),
  ('slow_down_verbal_cues',
   'Slow down with clear verbal cues',
   'Prompt to slow down using clear verbal cues and guide to walk safely.',
   'public', array['rushing_pushing','poolside_running'], 80),
  ('one_to_one_distract_model',
   '1:1, distract, model appropriate behaviour',
   'Staff working with allocated students, 1:1 where necessary. Distract if/when inappropriate behaviour takes place, with motivators or alternative activity. Model appropriate behaviour/interactions.',
   'public', array['inappropriate_public_behaviour'], 90),
  ('report_public_welfare',
   'Stay with staff + report to welfare',
   'Children to be with staff at all times. Anything inappropriate from members of the public to be reported to the child welfare officer.',
   'public', array['inappropriate_public_towards_child'], 100),
  ('vigilant_first_aid',
   'Vigilant staffing + first aid',
   'Vigilant staffing. First aid to be taken.',
   'injury', array['injury'], 110),
  ('trip_first_aid_kit_comms',
   'First aid kit + trained staff + comms',
   'Vigilant staffing and appropriate staff:child ratio. First aid box kept on transport. First aid kit at facility. School/club phone with staff to call ambulance where necessary. First aid trained staff present. Communicate with lifeguards / venue staff throughout sessions.',
   'injury', array['accidental_injuries'], 120),
  ('weather_contingency',
   'Weather forecast + indoor contingency',
   'Monitor weather forecasts before the trip, have a contingency plan for indoor activities if outdoor plans are disrupted, and ensure students dress appropriately for the weather.',
   'environment', array['inclement_weather'], 130),
  ('motivators_reassurance_ratio',
   'Motivators + reassurance + ratio',
   'Motivating items to be taken. Reassurance from staff. Maintain sufficient staff ratio to assist in calming the child.',
   'distress', array['child_distressed_anxious'], 140),
  ('increase_ratio_redirect_quiet',
   'Increase ratio + redirect to quiet space',
   'Increase staffing ratio if needed (e.g. towards 2:1), monitor emotional state and redirect to a quiet space or calming sensory activity.',
   'distress', array['dysregulated_needs_space'], 150),
  ('blanket_spare_clothes_private',
   'Blanket + spare clothes + private change',
   'Cover with a blanket. Calmly show and offer spare clothes and guide to a private area to change while reducing attention and demands.',
   'personal_care', array['removing_clothes_dysregulated','ripping_wet_clothes'], 160),
  ('toilet_prompt_routine',
   'Prompt regular toilet use',
   'Prompt and support regular toilet use and guide to the toilet when signs appear.',
   'personal_care', array['toileting_accidents'], 170),
  -- Club-specific
  ('big_pool_only_staff_exit',
   'Big pool only + staff between exit',
   'Use Big Pool only where agreed. Position staff between participant and exit. Maintain visual supervision at all times.',
   'pool', array['leaving_pool_area'], 180),
  ('first_then_transition_warning',
   'First-Then board + warning',
   'First-Then board with a clear warning before transitions (e.g. 2 minutes). Keep language short and consistent.',
   'transitions', array['transition_difficulties'], 190),
  ('reduce_demands_until_regulated',
   'Reduce demands until regulated',
   'Reduce demands until regulated before reintroducing planned activities. Re-engage gradually with preferred tasks first.',
   'transitions', array['fixation_preferred_item','dysregulated_needs_space'], 200),
  ('climbing_spotting_safe_descent',
   'Spotting + safe descent coaching',
   'Ensure belay/spotting protocols. Coach safe descent. Stop the climb if unsafe behaviour appears; reset with clear short instructions.',
   'climbing', array['climbing_unsafe_descent','climbing_height_anxiety'], 210),
  ('offer_choice_within_structure',
   'Offer limited choice within structure',
   'Offer limited choices within the planned structure to support engagement without losing the session goal.',
   'engagement', array['refusal_to_engage','water_refusal_or_fear'], 220)
on conflict (code) do update set
  label = excluded.label,
  body = excluded.body,
  category = excluded.category,
  behaviour_codes = excluded.behaviour_codes,
  sort_order = excluded.sort_order,
  updated_at = now(),
  is_active = true;

alter table public.portal_isp_behaviour_library enable row level security;
alter table public.portal_isp_strategy_library enable row level security;

drop policy if exists portal_isp_behaviour_library_select on public.portal_isp_behaviour_library;
create policy portal_isp_behaviour_library_select
  on public.portal_isp_behaviour_library
  for select to authenticated
  using (is_active = true);

drop policy if exists portal_isp_strategy_library_select on public.portal_isp_strategy_library;
create policy portal_isp_strategy_library_select
  on public.portal_isp_strategy_library
  for select to authenticated
  using (is_active = true);

grant select on public.portal_isp_behaviour_library to authenticated;
grant select on public.portal_isp_strategy_library to authenticated;
grant select, insert, update, delete on public.portal_isp_behaviour_library to service_role;
grant select, insert, update, delete on public.portal_isp_strategy_library to service_role;

commit;
