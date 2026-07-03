-- Leader term review (working_ui/termreview.html) and general staff observation
-- (working_ui/observation_portal.html). Inserts run after PDF download when the user
-- is authenticated; RLS mirrors other portal submission tables.

begin;

-- ---------------------------------------------------------------------------
-- Leader term reviews (leaders / admin / CEO only on insert)
-- ---------------------------------------------------------------------------

create table if not exists public.leader_term_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  reviewer_name text not null,
  staff_reviewed text not null,
  term text not null,
  report_date text null,
  service text not null,
  pdf_filename text null,
  responses jsonb not null default '{}'::jsonb
);

comment on table public.leader_term_reviews is
  'End-of-term leader review for a staff member (ratings + summary snapshot in responses jsonb).';

create index if not exists leader_term_reviews_submitted_by_user_id_idx
  on public.leader_term_reviews (submitted_by_user_id);

create index if not exists leader_term_reviews_created_at_idx
  on public.leader_term_reviews (created_at desc);

create index if not exists leader_term_reviews_staff_reviewed_idx
  on public.leader_term_reviews (staff_reviewed);

alter table public.leader_term_reviews enable row level security;

grant insert, select on table public.leader_term_reviews to authenticated;

drop policy if exists "leader_term_reviews_insert_lead_admin_ceo" on public.leader_term_reviews;
create policy "leader_term_reviews_insert_lead_admin_ceo"
on public.leader_term_reviews
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('lead', 'ceo', 'admin')
  )
);

drop policy if exists "leader_term_reviews_select_own" on public.leader_term_reviews;
create policy "leader_term_reviews_select_own"
on public.leader_term_reviews
for select
to authenticated
using (submitted_by_user_id = auth.uid());

drop policy if exists "leader_term_reviews_select_admin_ceo" on public.leader_term_reviews;
create policy "leader_term_reviews_select_admin_ceo"
on public.leader_term_reviews
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

-- ---------------------------------------------------------------------------
-- Staff observation reports (same insert roles as venue_reviews)
-- ---------------------------------------------------------------------------

create table if not exists public.staff_observation_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  session_date date not null,
  session_time text null,
  observer_label text null,
  location text null,
  staff_observed text not null,
  client_name text null,
  service text not null,
  pdf_filename text null,
  responses jsonb not null default '{}'::jsonb
);

comment on table public.staff_observation_reports is
  'Session observation checklist (observation_portal.html); responses holds field snapshot + summary_text.';

create index if not exists staff_observation_reports_submitted_by_user_id_idx
  on public.staff_observation_reports (submitted_by_user_id);

create index if not exists staff_observation_reports_session_date_idx
  on public.staff_observation_reports (session_date desc);

create index if not exists staff_observation_reports_created_at_idx
  on public.staff_observation_reports (created_at desc);

alter table public.staff_observation_reports enable row level security;

grant insert, select on table public.staff_observation_reports to authenticated;

drop policy if exists "staff_observation_reports_insert_staff_lead" on public.staff_observation_reports;
create policy "staff_observation_reports_insert_staff_lead"
on public.staff_observation_reports
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

drop policy if exists "staff_observation_reports_select_own" on public.staff_observation_reports;
create policy "staff_observation_reports_select_own"
on public.staff_observation_reports
for select
to authenticated
using (submitted_by_user_id = auth.uid());

drop policy if exists "staff_observation_reports_select_admin_ceo" on public.staff_observation_reports;
create policy "staff_observation_reports_select_admin_ceo"
on public.staff_observation_reports
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
