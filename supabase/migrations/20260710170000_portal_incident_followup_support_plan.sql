-- Phase A: incident triage/status + follow-up form + individual support plans.
-- Additive: does not change existing submit / notify / owner-alert behaviour.

begin;

-- ─── Incident lifecycle (extend existing table) ─────────────────────────────
alter table public.incident_reports
  add column if not exists workflow_status text not null default 'new',
  add column if not exists triage text null,
  add column if not exists triage_at timestamptz null,
  add column if not exists triage_by uuid null references auth.users (id) on delete set null,
  add column if not exists follow_up_started_at timestamptz null,
  add column if not exists follow_up_completed_at timestamptz null,
  add column if not exists closed_at timestamptz null,
  add column if not exists closed_by uuid null references auth.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'incident_reports_workflow_status_check'
  ) then
    alter table public.incident_reports
      add constraint incident_reports_workflow_status_check
      check (workflow_status in (
        'new',
        'triaged',
        'follow_up_in_progress',
        'follow_up_complete',
        'awaiting_instructor',
        'closed',
        'archived'
      ));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'incident_reports_triage_check'
  ) then
    alter table public.incident_reports
      add constraint incident_reports_triage_check
      check (
        triage is null
        or triage in ('no_follow_up', 'manager_review_only', 'formal_meeting')
      );
  end if;
end $$;

create index if not exists incident_reports_workflow_status_idx
  on public.incident_reports (workflow_status, created_at desc);

-- ─── Follow-up record (one active path per incident) ────────────────────────
create table if not exists public.portal_incident_followups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  incident_id uuid not null references public.incident_reports (id) on delete cascade,
  status text not null default 'in_progress',
  immediate_findings text null,
  root_cause text null,
  parent_communication text null,
  staff_discussion text null,
  lessons_learned text null,
  follow_up_summary text null,
  completed_at timestamptz null,
  completed_by uuid null references auth.users (id) on delete set null,
  created_by uuid null references auth.users (id) on delete set null,
  constraint portal_incident_followups_status_check
    check (status in ('in_progress', 'complete', 'cancelled')),
  constraint portal_incident_followups_incident_uidx unique (incident_id)
);

create index if not exists portal_incident_followups_incident_idx
  on public.portal_incident_followups (incident_id);

-- Strategy rows drafted during follow-up (Section 2)
create table if not exists public.portal_incident_followup_strategies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  followup_id uuid not null references public.portal_incident_followups (id) on delete cascade,
  sort_order int not null default 0,
  risk_behaviour text not null default '',
  strategy_in_place text not null default '',
  risk_level text not null default 'medium',
  constraint portal_incident_followup_strategies_risk_check
    check (risk_level in ('high', 'medium', 'low'))
);

create index if not exists portal_incident_followup_strategies_followup_idx
  on public.portal_incident_followup_strategies (followup_id, sort_order);

-- ─── Support plan (active profile section) ──────────────────────────────────
create table if not exists public.portal_support_plans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  participant_contact_id text null,
  participant_name text not null,
  status text not null default 'active',
  source_incident_id uuid null references public.incident_reports (id) on delete set null,
  source_followup_id uuid null references public.portal_incident_followups (id) on delete set null,
  activated_at timestamptz null,
  activated_by uuid null references auth.users (id) on delete set null,
  constraint portal_support_plans_status_check
    check (status in ('draft', 'pending_instructor', 'active', 'superseded', 'cancelled'))
);

create index if not exists portal_support_plans_participant_name_idx
  on public.portal_support_plans (lower(trim(participant_name)), status);

create index if not exists portal_support_plans_contact_idx
  on public.portal_support_plans (participant_contact_id)
  where participant_contact_id is not null;

-- Only one active plan per participant name (case-insensitive)
create unique index if not exists portal_support_plans_one_active_name_uidx
  on public.portal_support_plans (lower(trim(participant_name)))
  where status = 'active';

create table if not exists public.portal_support_plan_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  plan_id uuid not null references public.portal_support_plans (id) on delete cascade,
  sort_order int not null default 0,
  risk_behaviour text not null default '',
  strategy_in_place text not null default '',
  risk_level text not null default 'medium',
  source_incident_id uuid null references public.incident_reports (id) on delete set null,
  last_updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users (id) on delete set null,
  updated_by_name text null,
  item_status text not null default 'active',
  review_after text null,
  review_due_at date null,
  constraint portal_support_plan_items_risk_check
    check (risk_level in ('high', 'medium', 'low')),
  constraint portal_support_plan_items_status_check
    check (item_status in ('active', 'needs_updating', 'no_longer_required'))
);

create index if not exists portal_support_plan_items_plan_idx
  on public.portal_support_plan_items (plan_id, sort_order);

-- Draft updates awaiting Update Profile / instructor approve
create table if not exists public.portal_support_plan_updates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  incident_id uuid not null references public.incident_reports (id) on delete cascade,
  followup_id uuid not null references public.portal_incident_followups (id) on delete cascade,
  participant_name text not null,
  participant_contact_id text null,
  status text not null default 'draft',
  payload_json jsonb not null default '[]'::jsonb,
  created_by uuid null references auth.users (id) on delete set null,
  applied_plan_id uuid null references public.portal_support_plans (id) on delete set null,
  applied_at timestamptz null,
  constraint portal_support_plan_updates_status_check
    check (status in ('draft', 'pending_instructor', 'applied', 'cancelled'))
);

create index if not exists portal_support_plan_updates_incident_idx
  on public.portal_support_plan_updates (incident_id, created_at desc);

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.portal_incident_followups enable row level security;
alter table public.portal_incident_followup_strategies enable row level security;
alter table public.portal_support_plans enable row level security;
alter table public.portal_support_plan_items enable row level security;
alter table public.portal_support_plan_updates enable row level security;

-- Staff/lead/admin can read support plans (profile button)
drop policy if exists portal_support_plans_select_staff on public.portal_support_plans;
create policy portal_support_plans_select_staff
  on public.portal_support_plans
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('staff', 'lead', 'admin', 'ceo')
    )
  );

drop policy if exists portal_support_plan_items_select_staff on public.portal_support_plan_items;
create policy portal_support_plan_items_select_staff
  on public.portal_support_plan_items
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('staff', 'lead', 'admin', 'ceo')
    )
  );

-- Follow-ups readable by admin/ceo (and staff who can already read the incident)
drop policy if exists portal_incident_followups_select_staff on public.portal_incident_followups;
create policy portal_incident_followups_select_staff
  on public.portal_incident_followups
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('staff', 'lead', 'admin', 'ceo')
    )
  );

drop policy if exists portal_incident_followup_strategies_select_staff
  on public.portal_incident_followup_strategies;
create policy portal_incident_followup_strategies_select_staff
  on public.portal_incident_followup_strategies
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('staff', 'lead', 'admin', 'ceo')
    )
  );

drop policy if exists portal_support_plan_updates_select_staff on public.portal_support_plan_updates;
create policy portal_support_plan_updates_select_staff
  on public.portal_support_plan_updates
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('staff', 'lead', 'admin', 'ceo')
    )
  );

grant select on public.portal_incident_followups to authenticated;
grant select on public.portal_incident_followup_strategies to authenticated;
grant select on public.portal_support_plans to authenticated;
grant select on public.portal_support_plan_items to authenticated;
grant select on public.portal_support_plan_updates to authenticated;

grant select, insert, update, delete on public.portal_incident_followups to service_role;
grant select, insert, update, delete on public.portal_incident_followup_strategies to service_role;
grant select, insert, update, delete on public.portal_support_plans to service_role;
grant select, insert, update, delete on public.portal_support_plan_items to service_role;
grant select, insert, update, delete on public.portal_support_plan_updates to service_role;

commit;
