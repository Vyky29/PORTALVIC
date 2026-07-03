-- Portal April bootstrap (consolidated, idempotent).
-- Merged from database/migrations/ for Supabase CLI chain (before 20260424*).
-- Prod Portal already has this schema (applied manually); use migration repair on linked prod.
-- Omitted: 60417 (superseded by 60420), 60421 (RPC duplicated in Jun 2026 migrations),
--           payroll Roberto/director data seeds, 60720 UPDATE rows (contract_type → 20260607130100).
-- Depends on: auth.users, public.staff_profiles; optional clients/sessions/announcements for RLS section.
-- Regenerate: node scripts/build-april-bootstrap.mjs

begin;

-- ---------------------------------------------------------------------------
-- session_feedback table + admin select
-- Source: database/migrations/20260415_session_feedback.sql
-- ---------------------------------------------------------------------------

-- Session feedback: single persistence layer (Supabase). Run in Supabase SQL editor or via migration tooling.
-- Depends on: public.staff_profiles (id = auth.uid(), app_role in admin|ceo|lead|staff).


create table if not exists public.session_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  feedback_role text not null,
  portal_session_key text null,
  client_name text not null,
  session_date date not null,
  service text not null,
  attendance text not null,
  engagement_rating smallint not null,
  engagement_patterns text[] not null default '{}'::text[],
  positive_feedback text null,
  client_emotions text not null,
  exceptional_challenges text null,
  incidents text not null,
  completed_by_name text not null,
  has_positive_feedback boolean not null default false,
  has_exceptional_challenges boolean not null default false,
  constraint session_feedback_feedback_role_check
    check (feedback_role in ('staff', 'lead')),
  constraint session_feedback_engagement_rating_check
    check (engagement_rating between 1 and 5)
);

create index if not exists session_feedback_submitted_by_user_id_idx
  on public.session_feedback (submitted_by_user_id);

create index if not exists session_feedback_session_date_idx
  on public.session_feedback (session_date desc);

create index if not exists session_feedback_created_at_idx
  on public.session_feedback (created_at desc);

create index if not exists session_feedback_portal_session_key_idx
  on public.session_feedback (portal_session_key)
  where portal_session_key is not null;

alter table public.session_feedback enable row level security;

grant insert, select on table public.session_feedback to authenticated;

drop policy if exists "session_feedback_select_admin_ceo" on public.session_feedback;
create policy "session_feedback_select_admin_ceo"
on public.session_feedback
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
-- session_feedback context columns
-- Source: database/migrations/20260416_session_feedback_context.sql
-- ---------------------------------------------------------------------------

-- Session feedback: context-only fields + optional incidents column (incidents handled elsewhere).
-- Apply after 20260415_session_feedback.sql (table must exist).


alter table public.session_feedback
  add column if not exists client_id text null,
  add column if not exists session_time text null,
  add column if not exists relevant_information text null,
  add column if not exists has_relevant_information boolean not null default false;

alter table public.session_feedback
  alter column incidents drop not null;


-- ---------------------------------------------------------------------------
-- session_feedback nullable phase-2
-- Source: database/migrations/20260418_session_feedback_nullable_second_phase.sql
-- ---------------------------------------------------------------------------

-- Align session_feedback with two-step form: when attendance = 'No', second-phase fields are omitted (null).
-- Existing rows keep their values; only NOT NULL is relaxed.
-- Apply after 20260415_session_feedback.sql and 20260416_session_feedback_context.sql.


alter table public.session_feedback
  alter column engagement_rating drop not null;

alter table public.session_feedback
  alter column client_emotions drop not null;

-- Reviewed (already nullable, no change):
--   positive_feedback
--   relevant_information


-- ---------------------------------------------------------------------------
-- cancellation_reports
-- Source: database/migrations/20260420_cancellation_reports.sql
-- ---------------------------------------------------------------------------

create table if not exists public.cancellation_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  client_id text null,
  client_name text not null,
  session_date date not null,
  session_time text null,
  cancellation_timing text not null,
  service text not null,
  reason_category text not null,
  portal_session_key text null,
  origin text not null default 'dashboard',
  constraint cancellation_reports_origin_check check (origin in ('dashboard', 'this_week', 'term')),
  constraint cancellation_reports_cancellation_timing_check check (
    cancellation_timing in (
      'Before the session started',
      'During the session'
    )
  ),
  constraint cancellation_reports_reason_category_check check (
    reason_category in (
      'Illness: Fever',
      'Illness: Diarrhoea',
      'Illness: Vomiting',
      'Illness: Seizure',
      'Illness: Cold/Flu',
      'Unforeseen circumstances: Venue incident',
      'Unforeseen circumstances: Fire alarm / Fire drill',
      'Unforeseen circumstances: Power cuts / Flooding'
    )
  )
);

create index if not exists cancellation_reports_submitted_by_user_id_idx
  on public.cancellation_reports (submitted_by_user_id);

create index if not exists cancellation_reports_session_date_idx
  on public.cancellation_reports (session_date desc);

create index if not exists cancellation_reports_created_at_idx
  on public.cancellation_reports (created_at desc);

create index if not exists cancellation_reports_portal_session_key_idx
  on public.cancellation_reports (portal_session_key)
  where portal_session_key is not null;

alter table public.cancellation_reports enable row level security;

grant insert on table public.cancellation_reports to authenticated;

drop policy if exists "cancellation_reports_insert_staff_lead" on public.cancellation_reports;
create policy "cancellation_reports_insert_staff_lead"
on public.cancellation_reports
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


-- ---------------------------------------------------------------------------
-- incident_reports
-- Source: database/migrations/20260420_incident_reports.sql
-- ---------------------------------------------------------------------------

-- Incident reports persistence for dashboard incident flow.
-- Context fields come from sessionKey/dashboard/auth and are not typed manually in UI.


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


-- ---------------------------------------------------------------------------
-- portal auth generation + select own
-- Source: database/migrations/20260420_portal_auth_generation_and_review_select.sql
-- ---------------------------------------------------------------------------

-- Single active login: bump counter on each password login so other browsers can detect and sign out.
-- Cross-device review colours: staff can SELECT their own submitted rows from feedback / incident / cancellation.


-- 1) staff_profiles: monotonic generation (incremented from app on each new login)
alter table public.staff_profiles
  add column if not exists auth_session_generation bigint not null default 0;

create or replace function public.portal_bump_auth_session_generation()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  update public.staff_profiles
    set auth_session_generation = coalesce(auth_session_generation, 0) + 1
  where id = auth.uid()
  returning auth_session_generation into v;
  return coalesce(v, 0);
end;
$$;

grant execute on function public.portal_bump_auth_session_generation() to authenticated;

-- 2) session_feedback: submitter can read own rows (for dashboard sync)
drop policy if exists "session_feedback_select_own" on public.session_feedback;
create policy "session_feedback_select_own"
on public.session_feedback
for select
to authenticated
using (submitted_by_user_id = auth.uid());

-- 3) incident_reports: submitter can read own rows
drop policy if exists "incident_reports_select_own" on public.incident_reports;
create policy "incident_reports_select_own"
on public.incident_reports
for select
to authenticated
using (submitted_by_user_id = auth.uid());

-- 4) cancellation_reports: submitter can read own rows
drop policy if exists "cancellation_reports_select_own" on public.cancellation_reports;
create policy "cancellation_reports_select_own"
on public.cancellation_reports
for select
to authenticated
using (submitted_by_user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- session_feedback insert (ceo/admin)
-- Source: database/migrations/20260420_session_feedback_insert_rls_ceo_admin.sql
-- ---------------------------------------------------------------------------

-- Allow session_feedback INSERT when the submitter is staff_profiles with ceo or admin
-- (e.g. Victor uses Staff dashboard but app_role is not literally 'staff'/'lead').
-- feedback_role column still must be 'staff' or 'lead' (table check + form).


drop policy if exists "session_feedback_insert_staff_lead" on public.session_feedback;

create policy "session_feedback_insert_staff_lead"
on public.session_feedback
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
  and feedback_role in ('staff', 'lead')
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead', 'ceo', 'admin')
  )
);


-- ---------------------------------------------------------------------------
-- venue_reviews
-- Source: database/migrations/20260422_venue_reviews.sql
-- ---------------------------------------------------------------------------

-- Venue opening/closing checklist submissions (portal venue_review.html).


create table if not exists public.venue_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  review_date date not null,
  venue text null,
  opening_or_closing text null,
  review_time text not null,
  has_issues text not null,
  issues_reported text null,
  portal_session_key text null,
  origin text not null default 'dashboard',
  constraint venue_reviews_has_issues_check check (has_issues in ('Yes', 'No')),
  constraint venue_reviews_opening_or_closing_check check (
    opening_or_closing is null or opening_or_closing in ('Opening', 'Closing')
  ),
  constraint venue_reviews_origin_check check (origin in ('dashboard', 'this_week', 'term'))
);

create index if not exists venue_reviews_submitted_by_user_id_idx
  on public.venue_reviews (submitted_by_user_id);

create index if not exists venue_reviews_review_date_idx
  on public.venue_reviews (review_date desc);

create index if not exists venue_reviews_created_at_idx
  on public.venue_reviews (created_at desc);

create index if not exists venue_reviews_portal_session_key_idx
  on public.venue_reviews (portal_session_key)
  where portal_session_key is not null;

alter table public.venue_reviews enable row level security;

grant insert, select on table public.venue_reviews to authenticated;

drop policy if exists "venue_reviews_insert_staff_lead" on public.venue_reviews;
create policy "venue_reviews_insert_staff_lead"
on public.venue_reviews
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

drop policy if exists "venue_reviews_select_own" on public.venue_reviews;
create policy "venue_reviews_select_own"
on public.venue_reviews
for select
to authenticated
using (submitted_by_user_id = auth.uid());

drop policy if exists "venue_reviews_select_admin_ceo" on public.venue_reviews;
create policy "venue_reviews_select_admin_ceo"
on public.venue_reviews
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
-- documents + storage
-- Source: database/migrations/20260423_create_documents_table_storage_and_policies.sql
-- ---------------------------------------------------------------------------

-- Documents system: table + RLS + storage bucket/policies

create extension if not exists "uuid-ossp";

create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  document_type text not null,
  category text not null,
  title text not null,
  created_at timestamptz not null default now(),
  related_date date null,
  related_client text null,
  related_session_key text null,
  file_url text not null,
  source_page text not null
);

alter table public.documents enable row level security;

grant select, insert on table public.documents to authenticated;
revoke all on table public.documents from anon;

drop policy if exists documents_select_own on public.documents;
create policy documents_select_own
on public.documents
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own
on public.documents
for insert
to authenticated
with check (user_id = auth.uid());

-- Optional hardening: do not allow updates/deletes from client role
revoke update, delete on table public.documents from authenticated;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists documents_storage_select_own on storage.objects;
create policy documents_storage_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists documents_storage_insert_own on storage.objects;
create policy documents_storage_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists documents_storage_update_own on storage.objects;
create policy documents_storage_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists documents_storage_delete_own on storage.objects;
create policy documents_storage_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);


-- ---------------------------------------------------------------------------
-- RLS clients/sessions/announcements
-- Source: database/migrations/20260423_enable_rls_clients_sessions_announcements_select_authenticated.sql
-- ---------------------------------------------------------------------------

-- RLS clients/sessions/announcements (skip if legacy programme tables absent).
do $$
declare
  t text;
  pol text;
begin
  foreach t in array array['clients', 'sessions', 'announcements'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    pol := t || '_select_authenticated';
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('revoke select on table public.%I from anon', t);
    execute format(
      'revoke insert, update, delete on table public.%I from anon, authenticated',
      t
    );
    execute format('drop policy if exists %I on public.%I', pol, t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      pol,
      t
    );
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- expense_claims
-- Source: database/migrations/20260423_expense_claims_backend.sql
-- ---------------------------------------------------------------------------

-- Expenses backend.
-- Front-end submits expense lines; server persists claim rows in Supabase.


create table if not exists public.expense_claims (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  submitted_by_role text null,
  claim_month date null,
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  line_items jsonb not null default '[]'::jsonb,
  status text not null default 'submitted',
  submitted_on date not null default current_date,
  constraint expense_claims_status_check check (status in ('submitted', 'reviewed', 'approved', 'rejected', 'paid'))
);

comment on table public.expense_claims is
  'Staff expense claims with line items and totals. Receipts can be handled separately (storage/workflow).';

create index if not exists expense_claims_submitted_by_user_id_idx
  on public.expense_claims (submitted_by_user_id);

create index if not exists expense_claims_created_at_idx
  on public.expense_claims (created_at desc);

create or replace function public.expense_claims_apply_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.submitted_by_user_id is null then
    new.submitted_by_user_id := auth.uid();
  end if;

  if new.submitted_by_user_id is null then
    raise exception 'Unauthenticated user';
  end if;

  select coalesce(nullif(trim(sp.full_name), ''), nullif(trim(sp.username), '')),
         nullif(trim(coalesce(sp.role_track, sp.role, sp.app_role)), '')
  into new.submitted_by_name, new.submitted_by_role
  from public.staff_profiles sp
  where sp.id = new.submitted_by_user_id;

  if coalesce(trim(new.submitted_by_name), '') = '' then
    raise exception 'Missing staff profile display name';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_expense_claims_apply_server_fields on public.expense_claims;
create trigger trg_expense_claims_apply_server_fields
before insert or update on public.expense_claims
for each row
execute function public.expense_claims_apply_server_fields();

alter table public.expense_claims enable row level security;

grant insert, select, update on table public.expense_claims to authenticated;

drop policy if exists "expense_claims_insert_own" on public.expense_claims;
create policy "expense_claims_insert_own"
on public.expense_claims
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
);

drop policy if exists "expense_claims_select_own_admin_ceo" on public.expense_claims;
create policy "expense_claims_select_own_admin_ceo"
on public.expense_claims
for select
to authenticated
using (
  submitted_by_user_id = auth.uid()
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "expense_claims_update_admin_ceo" on public.expense_claims;
create policy "expense_claims_update_admin_ceo"
on public.expense_claims
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);


-- ---------------------------------------------------------------------------
-- lead_session_reports
-- Source: database/migrations/20260423_lead_session_reports.sql
-- ---------------------------------------------------------------------------

-- Lead session report (lead_feedback_report.html): session-level narrative by the service lead.
-- Separate from public.session_feedback (per-client staff feedback). Same day can have both
-- (e.g. Bespoke Programme: staff row in session_feedback + lead row here).
-- Admin filters: is_bespoke_programme; portal_session_key for slot-level (Multi-Activity, etc.).


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


-- ---------------------------------------------------------------------------
-- timesheets backend
-- Source: database/migrations/20260423_timesheets_backend.sql
-- ---------------------------------------------------------------------------

-- Timesheets backend (rates kept server-side).
-- Front-end submits hours only; pay is calculated in DB from staff_pay_rates.


create table if not exists public.staff_pay_rates (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  role_label text null,
  updated_at timestamptz not null default now()
);

comment on table public.staff_pay_rates is
  'Private pay rates per staff member (server-side only). Never exposed in front-end.';

create table if not exists public.staff_timesheets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  period_month date not null,
  role_label text not null,
  total_hours numeric(10,2) not null default 0 check (total_hours >= 0),
  entries jsonb not null default '[]'::jsonb,
  hourly_rate_used numeric(10,2) null,
  total_cost numeric(12,2) null,
  expected_hours numeric(10,2) null,
  status text not null default 'submitted',
  submitted_on date not null default current_date,
  constraint staff_timesheets_status_check check (status in ('submitted', 'reviewed', 'approved', 'rejected'))
);

comment on table public.staff_timesheets is
  'Staff monthly timesheets (hours + entries). total_cost calculated in DB from staff_pay_rates.';

create index if not exists staff_timesheets_submitted_by_user_id_idx
  on public.staff_timesheets (submitted_by_user_id);

create index if not exists staff_timesheets_period_month_idx
  on public.staff_timesheets (period_month desc);

create index if not exists staff_timesheets_created_at_idx
  on public.staff_timesheets (created_at desc);

create or replace function public.staff_timesheets_apply_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate numeric(10,2);
begin
  if new.submitted_by_user_id is null then
    new.submitted_by_user_id := auth.uid();
  end if;

  if new.submitted_by_user_id is null then
    raise exception 'Unauthenticated user';
  end if;

  select coalesce(nullif(trim(sp.full_name), ''), nullif(trim(sp.username), ''))
  into new.submitted_by_name
  from public.staff_profiles sp
  where sp.id = new.submitted_by_user_id;

  if coalesce(trim(new.submitted_by_name), '') = '' then
    raise exception 'Missing staff profile display name';
  end if;

  select r.hourly_rate
  into v_rate
  from public.staff_pay_rates r
  where r.user_id = new.submitted_by_user_id;

  new.hourly_rate_used := v_rate;
  if v_rate is not null then
    new.total_cost := round(coalesce(new.total_hours, 0) * v_rate, 2);
  else
    new.total_cost := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_staff_timesheets_apply_server_fields on public.staff_timesheets;
create trigger trg_staff_timesheets_apply_server_fields
before insert or update on public.staff_timesheets
for each row
execute function public.staff_timesheets_apply_server_fields();

alter table public.staff_pay_rates enable row level security;
alter table public.staff_timesheets enable row level security;

grant select on table public.staff_pay_rates to authenticated;
grant insert, select, update on table public.staff_timesheets to authenticated;

drop policy if exists "staff_pay_rates_select_own_admin_ceo" on public.staff_pay_rates;
create policy "staff_pay_rates_select_own_admin_ceo"
on public.staff_pay_rates
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "staff_timesheets_insert_own" on public.staff_timesheets;
create policy "staff_timesheets_insert_own"
on public.staff_timesheets
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
);

drop policy if exists "staff_timesheets_select_own_admin_ceo" on public.staff_timesheets;
create policy "staff_timesheets_select_own_admin_ceo"
on public.staff_timesheets
for select
to authenticated
using (
  submitted_by_user_id = auth.uid()
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "staff_timesheets_update_admin_ceo" on public.staff_timesheets;
create policy "staff_timesheets_update_admin_ceo"
on public.staff_timesheets
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

-- Initial pay-rate seed by known staff names (case-insensitive).
insert into public.staff_pay_rates (user_id, hourly_rate, role_label)
select sp.id, v.hourly_rate, v.role_label
from public.staff_profiles sp
join (
  values
    ('youssef', 22.00::numeric, 'Swimming Instructor 1'),
    ('roberto', 24.00::numeric, 'Swimming Instructor 2'),
    ('aurora', 28.00::numeric, 'Swimming Instructor 3'),
    ('angel', 28.00::numeric, 'Swimming Instructor 3'),
    ('dan', 28.00::numeric, 'Swimming Instructor 3'),
    ('javier', 28.00::numeric, 'Swimming Instructor 3'),
    ('alex', 30.00::numeric, 'Climbing Instructor 3'),
    ('carlos', 30.00::numeric, 'Climbing Instructor 3'),
    ('sandra', 28.00::numeric, 'Fitness Instructor 1'),
    ('godsway', 18.00::numeric, 'Support Worker 1'),
    ('giuseppe', 20.00::numeric, 'Support Worker 2'),
    ('bismark', 23.00::numeric, 'Support Worker 3'),
    ('john', 30.00::numeric, 'Service Lead'),
    ('berta', 30.00::numeric, 'Service Lead')
) as v(staff_name, hourly_rate, role_label)
  on lower(coalesce(sp.username, sp.full_name, '')) = v.staff_name
  or lower(coalesce(sp.full_name, sp.username, '')) = v.staff_name
on conflict (user_id) do update
set hourly_rate = excluded.hourly_rate,
    role_label = excluded.role_label,
    updated_at = now();


-- ---------------------------------------------------------------------------
-- documents soft-hide
-- Source: database/migrations/20260424_documents_user_soft_hide.sql
-- ---------------------------------------------------------------------------

-- Staff "Delete" in My Documents: soft-hide only (row + file kept for audit).
-- For accountant handoff, run a point-in-time export with the service role at your cutoff
-- (e.g. 24th 23:00 in your timezone) so the snapshot reflects every row that existed then, including since-hidden rows.

alter table public.documents
  add column if not exists hidden_by_user_at timestamptz null;

comment on column public.documents.hidden_by_user_at is
  'Set when the staff removes the document from My Documents. Row remains in DB for audit; accounting should use a point-in-time export (e.g. end of billing window).';

-- Staff SELECT only non-hidden rows (admin/service role bypasses RLS).
drop policy if exists documents_select_own on public.documents;
create policy documents_select_own
on public.documents
for select
to authenticated
using (user_id = auth.uid() and hidden_by_user_at is null);

-- Controlled update: only this RPC (SECURITY DEFINER); authenticated still has no broad UPDATE grant.
create or replace function public.hide_my_document(doc_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if doc_id is null then
    return;
  end if;
  update public.documents
  set hidden_by_user_at = now()
  where id = doc_id
    and user_id = auth.uid()
    and hidden_by_user_at is null;
end;
$$;

grant execute on function public.hide_my_document(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- staff_performance_reviews
-- Source: database/migrations/20260425_staff_performance_reviews.sql
-- ---------------------------------------------------------------------------

-- Staff performance review records (confidential HR).
-- Apply in Supabase after public.staff_profiles and auth patterns exist.
-- Front-end: working_ui/performance.html + staff_performance_review_app.js


create table if not exists public.staff_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subject_user_id uuid null references auth.users (id) on delete set null,
  subject_display_name text not null,
  review_date text not null,
  reviewer_user_id uuid not null references auth.users (id) on delete restrict,
  reviewer_display_name text not null,
  responses jsonb not null default '{}'::jsonb
);

comment on table public.staff_performance_reviews is
  'In-meeting staff performance review capture. responses holds structured form payload; subject_user_id optional link for reporting.';

create index if not exists staff_performance_reviews_created_at_idx
  on public.staff_performance_reviews (created_at desc);

create index if not exists staff_performance_reviews_subject_user_id_idx
  on public.staff_performance_reviews (subject_user_id)
  where subject_user_id is not null;

create index if not exists staff_performance_reviews_reviewer_user_id_idx
  on public.staff_performance_reviews (reviewer_user_id);

create or replace function public.staff_performance_reviews_apply_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo', 'lead')
  ) then
    raise exception 'Only admin, ceo or lead may record staff performance reviews';
  end if;

  if new.reviewer_user_id is null then
    new.reviewer_user_id := auth.uid();
  end if;

  if new.reviewer_user_id is distinct from auth.uid() then
    raise exception 'Reviewer must match the signed-in user';
  end if;

  select coalesce(nullif(trim(sp.full_name), ''), nullif(trim(sp.username), ''))
  into new.reviewer_display_name
  from public.staff_profiles sp
  where sp.id = new.reviewer_user_id;

  if coalesce(trim(new.reviewer_display_name), '') = '' then
    raise exception 'Missing reviewer display name on staff profile';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_staff_performance_reviews_apply_server_fields on public.staff_performance_reviews;
create trigger trg_staff_performance_reviews_apply_server_fields
before insert on public.staff_performance_reviews
for each row
execute function public.staff_performance_reviews_apply_server_fields();

alter table public.staff_performance_reviews enable row level security;

grant insert, select on table public.staff_performance_reviews to authenticated;

drop policy if exists "staff_performance_reviews_insert_admin_ceo" on public.staff_performance_reviews;
create policy "staff_performance_reviews_insert_admin_ceo"
on public.staff_performance_reviews
for insert
to authenticated
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo', 'lead')
  )
  and reviewer_user_id = auth.uid()
);

drop policy if exists "staff_performance_reviews_select_admin_ceo" on public.staff_performance_reviews;
create policy "staff_performance_reviews_select_admin_ceo"
on public.staff_performance_reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo', 'lead')
  )
);


-- ---------------------------------------------------------------------------
-- session_feedback lead select all
-- Source: database/migrations/20260426_session_feedback_lead_select_all.sql
-- ---------------------------------------------------------------------------

-- Allow service leads to SELECT all session_feedback rows (same table scope as admin/ceo policy).
-- Needed for performance.html context when a lead opens ?subject=<staff uuid>.
-- Permissive RLS: combined with existing policies via OR.


drop policy if exists "session_feedback_select_lead_all" on public.session_feedback;
create policy "session_feedback_select_lead_all"
on public.session_feedback
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role = 'lead'
  )
);


-- ---------------------------------------------------------------------------
-- leader term + observation reports
-- Source: database/migrations/20260427_leader_term_reviews_and_staff_observation_reports.sql
-- ---------------------------------------------------------------------------

-- Leader term review (working_ui/termreview.html) and general staff observation
-- (working_ui/observation_portal.html). Inserts run after PDF download when the user
-- is authenticated; RLS mirrors other portal submission tables.


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


-- ---------------------------------------------------------------------------
-- schedule_overrides foundation
-- Source: database/migrations/20260429_schedule_overrides_foundation.sql
-- ---------------------------------------------------------------------------

-- Admin Scheduling & Cover — backend foundation (single-day overrides).
-- Spreadsheet remains the source of truth; this layer stores operational overrides only.
--
-- ROLLBACK (manual):
--   begin;
--   drop policy if exists "schedule_override_events_admin_ceo_all" on public.schedule_override_events;
--   drop policy if exists "schedule_override_events_lead_select" on public.schedule_override_events;
--   drop policy if exists "schedule_override_events_staff_select_own_scope" on public.schedule_override_events;
--   drop policy if exists "schedule_overrides_admin_ceo_all" on public.schedule_overrides;
--   drop policy if exists "schedule_overrides_lead_select" on public.schedule_overrides;
--   drop policy if exists "schedule_overrides_staff_select_own_rota" on public.schedule_overrides;
--   drop function if exists public.portal_schedule_anchor_staff_matches_me(text);
--   alter table if exists public.schedule_override_events drop constraint if exists schedule_override_events_override_id_fkey;
--   drop table if exists public.schedule_override_events;
--   drop table if exists public.schedule_overrides;
--   commit;
-- Note: drop order — events first if FK from overrides → events; here events reference overrides, so events first.


-- ---------------------------------------------------------------------------
-- Helper: roster key aligned with dashboard logic (first word of username,
-- then full_name; lowercased; non-alphanumeric stripped). Not identical to
-- JS NFD normalisation; document in handoff if diacritics matter.
-- ---------------------------------------------------------------------------
create or replace function public.portal_schedule_anchor_staff_matches_me(p_anchor_staff_id text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead')
      and lower(regexp_replace(
        split_part(
          coalesce(nullif(trim(sp.username), ''), trim(sp.full_name)),
          ' ',
          1
        ),
        '[^a-z0-9]+',
        '',
        'g'
      )) = lower(trim(both from p_anchor_staff_id))
  );
$$;

comment on function public.portal_schedule_anchor_staff_matches_me(text) is
  'True when the signed-in user is staff or lead and the argument matches their derived roster key (spreadsheet staffId).';

-- ---------------------------------------------------------------------------
-- 1. schedule_overrides
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) default auth.uid(),
  updated_by uuid not null references auth.users (id) default auth.uid(),
  session_date date not null,
  anchor_staff_id text not null,
  anchor_start time not null,
  anchor_end time not null,
  anchor_venue text not null,
  anchor_client_id text not null,
  anchor_time_slot_label text not null default '',
  override_type text not null,
  payload jsonb not null default '{}'::jsonb,
  reason text null,
  status text not null default 'active',
  superseded_by uuid null references public.schedule_overrides (id) on delete set null,
  spreadsheet_revision text null,
  constraint schedule_overrides_override_type_check
    check (
      override_type in (
        'client_absence_announced',
        'slot_clear_client',
        'client_replace_in_slot',
        'instructor_reassign',
        'slot_close',
        'override_void'
      )
    ),
  constraint schedule_overrides_status_check
    check (status in ('active', 'cancelled'))
);

comment on table public.schedule_overrides is
  'Single-day operational overrides over spreadsheet-derived sessions; dashboards merge later. V1: filter by session_date only (no date range on row).';

create index if not exists schedule_overrides_session_date_status_idx
  on public.schedule_overrides (session_date, status);

create index if not exists schedule_overrides_anchor_staff_session_date_idx
  on public.schedule_overrides (anchor_staff_id, session_date);

create index if not exists schedule_overrides_override_type_session_date_idx
  on public.schedule_overrides (override_type, session_date);

create index if not exists schedule_overrides_superseded_by_idx
  on public.schedule_overrides (superseded_by)
  where superseded_by is not null;

create index if not exists schedule_overrides_created_by_idx
  on public.schedule_overrides (created_by);

-- Keep updated_* coherent on row changes (optional for API-only updates).
create or replace function public.schedule_overrides_set_updated()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists schedule_overrides_set_updated_trg on public.schedule_overrides;
create trigger schedule_overrides_set_updated_trg
before update on public.schedule_overrides
for each row
execute function public.schedule_overrides_set_updated();

-- ---------------------------------------------------------------------------
-- 2. schedule_override_events (append-only audit; application inserts rows)
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_override_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid not null references auth.users (id) default auth.uid(),
  override_id uuid not null references public.schedule_overrides (id) on delete restrict,
  action text not null,
  before_snapshot jsonb null,
  after_snapshot jsonb null,
  client_context jsonb null,
  constraint schedule_override_events_action_check
    check (action in ('create', 'update', 'void', 'supersede'))
);

comment on table public.schedule_override_events is
  'Append-only audit log for schedule_overrides; RLS mirrors read scope of overrides.';

create index if not exists schedule_override_events_override_id_idx
  on public.schedule_override_events (override_id);

create index if not exists schedule_override_events_created_at_idx
  on public.schedule_override_events (created_at desc);

create index if not exists schedule_override_events_actor_id_idx
  on public.schedule_override_events (actor_id);

-- ---------------------------------------------------------------------------
-- Grants: RLS enforces row access; no anon.
-- ---------------------------------------------------------------------------
revoke all on public.schedule_overrides from public;
revoke all on public.schedule_override_events from public;
revoke all on public.schedule_overrides from anon;
revoke all on public.schedule_override_events from anon;

grant select, insert, update, delete on public.schedule_overrides to authenticated;
grant select, insert on public.schedule_override_events to authenticated;

-- Helper executed inside policies; staff must be able to invoke it.
grant execute on function public.portal_schedule_anchor_staff_matches_me(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: schedule_overrides
-- ---------------------------------------------------------------------------
alter table public.schedule_overrides enable row level security;

drop policy if exists "schedule_overrides_admin_ceo_all" on public.schedule_overrides;
create policy "schedule_overrides_admin_ceo_all"
on public.schedule_overrides
for all
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "schedule_overrides_lead_select" on public.schedule_overrides;
-- Lead: same visibility as staff — own anchor rows + instructor_reassign where they are covering.
create policy "schedule_overrides_lead_select"
on public.schedule_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role = 'lead'
      and (
        public.portal_schedule_anchor_staff_matches_me(anchor_staff_id)
        or (
          override_type = 'instructor_reassign'
          and nullif(trim(payload ->> 'covering_staff_id'), '') is not null
          and public.portal_schedule_anchor_staff_matches_me(trim(payload ->> 'covering_staff_id'))
        )
      )
  )
);

drop policy if exists "schedule_overrides_staff_select_own_rota" on public.schedule_overrides;
create policy "schedule_overrides_staff_select_own_rota"
on public.schedule_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role = 'staff'
      and (
        public.portal_schedule_anchor_staff_matches_me(anchor_staff_id)
        or (
          override_type = 'instructor_reassign'
          and nullif(trim(payload ->> 'covering_staff_id'), '') is not null
          and public.portal_schedule_anchor_staff_matches_me(trim(payload ->> 'covering_staff_id'))
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- RLS: schedule_override_events
-- ---------------------------------------------------------------------------
alter table public.schedule_override_events enable row level security;

drop policy if exists "schedule_override_events_admin_ceo_all" on public.schedule_override_events;
create policy "schedule_override_events_admin_ceo_all"
on public.schedule_override_events
for all
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "schedule_override_events_lead_select" on public.schedule_override_events;
create policy "schedule_override_events_lead_select"
on public.schedule_override_events
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role = 'lead'
  )
  and exists (
    select 1
    from public.schedule_overrides o
    where o.id = schedule_override_events.override_id
  )
);

drop policy if exists "schedule_override_events_staff_select_own_scope" on public.schedule_override_events;
create policy "schedule_override_events_staff_select_own_scope"
on public.schedule_override_events
for select
to authenticated
using (
  exists (
    select 1
    from public.schedule_overrides o
    where o.id = override_id
      and (
        public.portal_schedule_anchor_staff_matches_me(o.anchor_staff_id)
        or (
          o.override_type = 'instructor_reassign'
          and nullif(trim(o.payload ->> 'covering_staff_id'), '') is not null
          and public.portal_schedule_anchor_staff_matches_me(trim(o.payload ->> 'covering_staff_id'))
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- WHAT FRONTEND / API MUST DO LATER (not in this migration)
-- ---------------------------------------------------------------------------
-- 1. After bootstrap from spreadsheet, fetch schedule_overrides for the view
--    session_date (single day) and merge into effectiveSessions in JS.
-- 2. Admin UI: insert/update schedule_overrides; append schedule_override_events
--    with action create|update|void|supersede and JSON snapshots.
-- 3. instructor_reassign: set payload.covering_staff_id to the covering roster key
--    (same normalisation as anchor_staff_id) so RLS lets that staff read the row.
-- 4. Pass spreadsheet_revision from the bundle version string when writing overrides.
-- 5. override_void: application sets target row status cancelled / superseded_by;
--    log a schedule_override_events row with action void or supersede.
-- 6. Leads currently see all overrides; add venue or site keys to the row if you
--    need lead RLS to match operational territory.


-- ---------------------------------------------------------------------------
-- hr_records
-- Source: database/migrations/20260607220000_hr_records.sql
-- ---------------------------------------------------------------------------

-- HR matrix store (fed by the STAFF MATRIX spreadsheet).
-- One row per spreadsheet row, grouped by `sheet`. Heterogeneous columns are
-- kept in `data` (jsonb) so the source workbook can evolve without schema churn.
-- Contains PII (DOB, addresses, health, bank, emergency contacts) => RLS locks
-- it to admin / CEO only. Data is loaded locally from hr_source/ (never committed,
-- never deployed). The browser uses only the anon key + this RLS.


-- Normalised name key (lowercase, accent-folded, alphanumerics only) used to
-- match spreadsheet people to staff_profiles. Python importer mirrors this.
create or replace function public.hr_name_key(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(translate(coalesce(p, ''),
      'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
      'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')),
    '[^a-z0-9]', '', 'g')
$$;

create table if not exists public.hr_records (
  id            uuid primary key default gen_random_uuid(),
  sheet         text not null,
  row_index     integer,
  name_key      text,
  employee_name text,
  staff_id      uuid references public.staff_profiles (id) on delete set null,
  data          json not null default '{}'::json, -- json (not jsonb) to preserve column order for the admin view

  source_file   text,
  imported_at   timestamptz not null default now()
);

comment on table public.hr_records is
  'HR matrix rows imported from the STAFF MATRIX workbook. Admin/CEO only (PII).';

create index if not exists hr_records_sheet_idx     on public.hr_records (sheet);
create index if not exists hr_records_name_key_idx  on public.hr_records (name_key);
create index if not exists hr_records_staff_id_idx  on public.hr_records (staff_id);

alter table public.hr_records enable row level security;

grant select, insert, update, delete on table public.hr_records to authenticated;

-- Admin / CEO: full access.
drop policy if exists "hr_records_admin_all" on public.hr_records;
create policy "hr_records_admin_all"
on public.hr_records
for all
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);


-- ---------------------------------------------------------------------------
-- hr_records.active
-- Source: database/migrations/20260607230000_hr_records_active.sql
-- ---------------------------------------------------------------------------

-- HR people active/inactive flag (HR-only label; does NOT affect app login).
-- Lets the admin filter every H&R category by Active (default) / All / Inactive,
-- and toggle a person inactive from the admin app. Kept per-row so any sheet can
-- be filtered directly; toggling a person updates all rows sharing their name_key.


alter table public.hr_records
  add column if not exists active boolean not null default true;

create index if not exists hr_records_active_idx on public.hr_records (active);


-- ---------------------------------------------------------------------------
-- client_payments
-- Source: database/migrations/20260607240000_client_payments.sql
-- ---------------------------------------------------------------------------

-- Client payments store (fed by the "SUMMER. Re-enrolments" workbook).
-- One row per spreadsheet row, grouped by `sheet` (PARENTS / LA / No re-enroled).
-- Heterogeneous columns kept in `data` (json) so the workbook can evolve without
-- schema churn; the actionable fields (status, amount, client) are promoted to
-- columns for fast filtering and totals.
--
-- Contains client PII (names, parents, amounts) => RLS locks it to admin / CEO.
-- Loaded locally from payments_source/ (never committed, never deployed). The
-- browser uses only the anon key + this RLS. Edits in the admin app win
-- (the workbook is the initial load only).


create table if not exists public.client_payments (
  id             uuid primary key default gen_random_uuid(),
  sheet          text not null,
  row_index      integer,
  client_key     text,
  client_name    text,
  parent_name    text,
  payment_status text,                       -- Paid / Outstanding / Not paid / Not re-enrolled
  amount         numeric(12,2),              -- total billed for the row
  data           json not null default '{}'::json, -- json (not jsonb) to preserve column order
  source_file    text,
  imported_at    timestamptz not null default now()
);

comment on table public.client_payments is
  'Client re-enrolment payments imported from the SUMMER workbook. Admin/CEO only (PII).';

create index if not exists client_payments_sheet_idx      on public.client_payments (sheet);
create index if not exists client_payments_client_key_idx on public.client_payments (client_key);
create index if not exists client_payments_status_idx     on public.client_payments (payment_status);

alter table public.client_payments enable row level security;

grant select, insert, update, delete on table public.client_payments to authenticated;

-- Admin / CEO: full access.
drop policy if exists "client_payments_admin_all" on public.client_payments;
create policy "client_payments_admin_all"
on public.client_payments
for all
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);


commit;
