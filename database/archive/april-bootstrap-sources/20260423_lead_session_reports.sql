-- Lead session report (lead_feedback_report.html): session-level narrative by the service lead.
-- Separate from public.session_feedback (per-client staff feedback). Same day can have both
-- (e.g. Bespoke Programme: staff row in session_feedback + lead row here).
-- Admin filters: is_bespoke_programme; portal_session_key for slot-level (Multi-Activity, etc.).

begin;

create table if not exists public.lead_session_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  session_date date not null,
  session_time text null,
  portal_session_key text null,
  client_id text null,
  client_name text null,
  service text not null,
  is_bespoke_programme boolean not null default false,
  engagement text not null,
  brief_description text not null,
  other_information text null,
  incidents text not null,
  summary_text text not null,
  origin text not null default 'dashboard',
  constraint lead_session_reports_engagement_check check (
    engagement in ('Very low', 'Mixed', 'Good', 'Excellent')
  ),
  constraint lead_session_reports_incidents_check check (incidents in ('Yes', 'No')),
  constraint lead_session_reports_origin_check check (origin in ('dashboard', 'this_week', 'term'))
);

comment on table public.lead_session_reports is
  'Service-lead session narrative (engagement, brief, incidents, generated summary). '
  'Not staff per-client session_feedback. Use is_bespoke_programme + client_name + portal_session_key for admin views.';

create index if not exists lead_session_reports_submitted_by_user_id_idx
  on public.lead_session_reports (submitted_by_user_id);

create index if not exists lead_session_reports_session_date_idx
  on public.lead_session_reports (session_date desc);

create index if not exists lead_session_reports_created_at_idx
  on public.lead_session_reports (created_at desc);

create index if not exists lead_session_reports_portal_session_key_idx
  on public.lead_session_reports (portal_session_key)
  where portal_session_key is not null;

create index if not exists lead_session_reports_bespoke_date_idx
  on public.lead_session_reports (session_date desc, is_bespoke_programme);

alter table public.lead_session_reports enable row level security;

grant insert, select on table public.lead_session_reports to authenticated;

drop policy if exists "lead_session_reports_insert_staff_lead" on public.lead_session_reports;
create policy "lead_session_reports_insert_staff_lead"
on public.lead_session_reports
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead', 'ceo', 'admin')
  )
);

drop policy if exists "lead_session_reports_select_own" on public.lead_session_reports;
create policy "lead_session_reports_select_own"
on public.lead_session_reports
for select
to authenticated
using (submitted_by_user_id = auth.uid());

drop policy if exists "lead_session_reports_select_admin_ceo" on public.lead_session_reports;
create policy "lead_session_reports_select_admin_ceo"
on public.lead_session_reports
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

commit;
