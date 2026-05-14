-- Incident reports persistence for dashboard incident flow.
-- Context fields come from sessionKey/dashboard/auth and are not typed manually in UI.

begin;

create table if not exists public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  client_id text null,
  client_name text not null,
  session_date date not null,
  session_time text null,
  incident_time text not null,
  service text not null,
  location text null,
  portal_session_key text null,
  incident_category text not null,
  staff_involved text null,
  witness text null,
  statement_before text null,
  statement_during text null,
  statement_after text null,
  injuries_client text null,
  injuries_staff text null,
  origin text not null default 'dashboard',
  constraint incident_reports_origin_check check (origin in ('dashboard', 'this_week', 'term')),
  constraint incident_reports_incident_category_check check (
    incident_category in (
      'Safeguarding Concern',
      'Personal Injury',
      'Client Injury',
      'Property Damage',
      'Dangerous occurrence',
      'Fire incident',
      'Fire drill',
      'Security incident',
      'Environmental incident',
      'Near miss'
    )
  )
);

create index if not exists incident_reports_submitted_by_user_id_idx
  on public.incident_reports (submitted_by_user_id);

create index if not exists incident_reports_session_date_idx
  on public.incident_reports (session_date desc);

create index if not exists incident_reports_created_at_idx
  on public.incident_reports (created_at desc);

create index if not exists incident_reports_portal_session_key_idx
  on public.incident_reports (portal_session_key)
  where portal_session_key is not null;

alter table public.incident_reports enable row level security;

grant insert on table public.incident_reports to authenticated;

drop policy if exists "incident_reports_insert_staff_lead" on public.incident_reports;
create policy "incident_reports_insert_staff_lead"
on public.incident_reports
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead')
  )
);

commit;
