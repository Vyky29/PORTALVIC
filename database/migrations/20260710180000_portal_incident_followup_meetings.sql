-- Phase B/C: follow-up meetings, invitee availability, instructor review hooks.
-- Additive on Phase A support-plan tables.

begin;

-- Extra workflow statuses for meeting path
alter table public.incident_reports
  drop constraint if exists incident_reports_workflow_status_check;

alter table public.incident_reports
  add constraint incident_reports_workflow_status_check
  check (workflow_status in (
    'new',
    'triaged',
    'follow_up_in_progress',
    'meeting_scheduled',
    'meeting_confirmed',
    'follow_up_complete',
    'awaiting_instructor',
    'closed',
    'archived'
  ));

create table if not exists public.portal_incident_followup_meetings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  incident_id uuid not null references public.incident_reports (id) on delete cascade,
  followup_id uuid null references public.portal_incident_followups (id) on delete set null,
  meeting_type text not null default 'internal_review',
  proposed_at timestamptz null,
  location_mode text not null default 'teams',
  location_detail text null,
  status text not null default 'draft',
  confirmed_at timestamptz null,
  confirmed_by uuid null references auth.users (id) on delete set null,
  created_by uuid null references auth.users (id) on delete set null,
  notes text null,
  constraint portal_incident_followup_meetings_type_check
    check (meeting_type in (
      'internal_review',
      'parent_meeting',
      'staff_follow_up',
      'multi_disciplinary'
    )),
  constraint portal_incident_followup_meetings_location_check
    check (location_mode in ('teams', 'in_person', 'phone', 'other')),
  constraint portal_incident_followup_meetings_status_check
    check (status in (
      'draft',
      'awaiting_responses',
      'confirmed',
      'cancelled',
      'completed'
    ))
);

create unique index if not exists portal_incident_followup_meetings_one_open_uidx
  on public.portal_incident_followup_meetings (incident_id)
  where status in ('draft', 'awaiting_responses', 'confirmed');

create index if not exists portal_incident_followup_meetings_incident_idx
  on public.portal_incident_followup_meetings (incident_id, created_at desc);

create table if not exists public.portal_incident_followup_invitees (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  meeting_id uuid not null references public.portal_incident_followup_meetings (id) on delete cascade,
  role text not null default 'other_staff',
  user_id uuid null references auth.users (id) on delete set null,
  display_name text not null default '',
  email text null,
  phone text null,
  required boolean not null default true,
  response text not null default 'pending',
  suggested_at timestamptz null,
  response_note text null,
  responded_at timestamptz null,
  constraint portal_incident_followup_invitees_role_check
    check (role in (
      'submitter',
      'primary_instructor',
      'service_lead',
      'parent',
      'witness',
      'other_staff',
      'admin'
    )),
  constraint portal_incident_followup_invitees_response_check
    check (response in ('pending', 'available', 'unable', 'suggest_time'))
);

create index if not exists portal_incident_followup_invitees_meeting_idx
  on public.portal_incident_followup_invitees (meeting_id);

create index if not exists portal_incident_followup_invitees_user_idx
  on public.portal_incident_followup_invitees (user_id)
  where user_id is not null;

-- Optional review_after on strategy items already exists; add review response log
create table if not exists public.portal_support_plan_item_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  item_id uuid not null references public.portal_support_plan_items (id) on delete cascade,
  reviewed_by uuid null references auth.users (id) on delete set null,
  outcome text not null,
  note text null,
  constraint portal_support_plan_item_reviews_outcome_check
    check (outcome in ('effective', 'needs_updating', 'no_longer_required'))
);

alter table public.portal_incident_followup_meetings enable row level security;
alter table public.portal_incident_followup_invitees enable row level security;
alter table public.portal_support_plan_item_reviews enable row level security;

drop policy if exists portal_incident_followup_meetings_select_staff
  on public.portal_incident_followup_meetings;
create policy portal_incident_followup_meetings_select_staff
  on public.portal_incident_followup_meetings
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('staff', 'lead', 'admin', 'ceo')
    )
  );

drop policy if exists portal_incident_followup_invitees_select_staff
  on public.portal_incident_followup_invitees;
create policy portal_incident_followup_invitees_select_staff
  on public.portal_incident_followup_invitees
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('staff', 'lead', 'admin', 'ceo')
    )
  );

-- Invitee can update own response
drop policy if exists portal_incident_followup_invitees_update_own
  on public.portal_incident_followup_invitees;
create policy portal_incident_followup_invitees_update_own
  on public.portal_incident_followup_invitees
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists portal_support_plan_item_reviews_select_staff
  on public.portal_support_plan_item_reviews;
create policy portal_support_plan_item_reviews_select_staff
  on public.portal_support_plan_item_reviews
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('staff', 'lead', 'admin', 'ceo')
    )
  );

grant select on public.portal_incident_followup_meetings to authenticated;
grant select, update on public.portal_incident_followup_invitees to authenticated;
grant select on public.portal_support_plan_item_reviews to authenticated;

grant select, insert, update, delete on public.portal_incident_followup_meetings to service_role;
grant select, insert, update, delete on public.portal_incident_followup_invitees to service_role;
grant select, insert, update, delete on public.portal_support_plan_item_reviews to service_role;

commit;
