-- Parent Absent reports: Missed session → optional proof (14 days) → admin validation → credit/refund/makeup.
-- Club cancellations stay on schedule_overrides / notify kinds; parents do not cancel sessions here.

create extension if not exists "uuid-ossp";

create table if not exists public.portal_parent_absence_reports (
  id uuid primary key default uuid_generate_v4(),
  parent_person_id text not null,
  contact_id text not null,
  participant_display text not null default '',
  session_date date not null,
  service_label text not null default '',
  session_time text not null default '',
  -- missed = no usable proof yet; pending_review = proof uploaded awaiting admin;
  -- excused = admin approved (credit/refund/makeup available); rejected = proof not accepted;
  -- expired = proof window closed without approval.
  status text not null default 'missed'
    check (status in ('missed', 'pending_review', 'excused', 'rejected', 'expired')),
  reason_text text not null default '',
  proof_storage_path text null,
  proof_file_name text null,
  proof_mime text null,
  proof_uploaded_at timestamptz null,
  proof_deadline date not null,
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users (id) on delete set null,
  review_notes text null,
  -- Set when admin excuses: credit | refund | makeup | none
  outcome text null check (outcome is null or outcome in ('credit', 'refund', 'makeup', 'none')),
  outcome_notes text null,
  schedule_override_id uuid null,
  inbound_message_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_parent_absence_reports_parent_idx
  on public.portal_parent_absence_reports (parent_person_id, created_at desc);

create index if not exists portal_parent_absence_reports_contact_idx
  on public.portal_parent_absence_reports (contact_id, session_date desc);

create index if not exists portal_parent_absence_reports_status_idx
  on public.portal_parent_absence_reports (status, proof_deadline);

create index if not exists portal_parent_absence_reports_pending_idx
  on public.portal_parent_absence_reports (status, created_at desc)
  where status = 'pending_review';

create unique index if not exists portal_parent_absence_reports_unique_session_idx
  on public.portal_parent_absence_reports (contact_id, session_date, service_label);

alter table public.portal_parent_absence_reports enable row level security;

revoke all on table public.portal_parent_absence_reports from anon, authenticated;
grant select, update on table public.portal_parent_absence_reports to authenticated;

drop policy if exists portal_parent_absence_reports_select_admin on public.portal_parent_absence_reports;
create policy portal_parent_absence_reports_select_admin
  on public.portal_parent_absence_reports
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_parent_absence_reports_update_admin on public.portal_parent_absence_reports;
create policy portal_parent_absence_reports_update_admin
  on public.portal_parent_absence_reports
  for update
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

insert into storage.buckets (id, name, public)
values ('parent-absence-proofs', 'parent-absence-proofs', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists parent_absence_proofs_storage_select_admin on storage.objects;
create policy parent_absence_proofs_storage_select_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'parent-absence-proofs'
    and public.portal_staff_profile_is_admin_or_ceo()
  );

comment on table public.portal_parent_absence_reports is
  'Parent Absent reports: start as missed; proof upload within 14 days of session_date; admin must validate before credit/refund/makeup.';
