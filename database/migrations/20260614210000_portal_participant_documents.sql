-- Parent-submitted participant forms (climbing registration, client registration).

create extension if not exists "uuid-ossp";

create table if not exists public.portal_participant_documents (
  id uuid primary key default uuid_generate_v4(),
  form_type text not null check (form_type in ('climbing_registration', 'client_registration')),
  participant_name text not null,
  participant_dob date null,
  parent_name text null,
  parent_email text null,
  parent_phone text null,
  pdf_storage_path text not null,
  photo_storage_path text null,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'reviewed')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users (id) on delete set null
);

create index if not exists portal_participant_documents_name_idx
  on public.portal_participant_documents (lower(participant_name));

create index if not exists portal_participant_documents_submitted_idx
  on public.portal_participant_documents (submitted_at desc);

alter table public.portal_participant_documents enable row level security;

-- Admin/CEO read via helper; inserts only through service role (edge function).
revoke all on table public.portal_participant_documents from anon, authenticated;
grant select on table public.portal_participant_documents to authenticated;

drop policy if exists portal_participant_documents_select_admin on public.portal_participant_documents;
create policy portal_participant_documents_select_admin
  on public.portal_participant_documents
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_participant_documents_update_admin on public.portal_participant_documents;
create policy portal_participant_documents_update_admin
  on public.portal_participant_documents
  for update
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

grant update (status, reviewed_at, reviewed_by) on table public.portal_participant_documents to authenticated;

insert into storage.buckets (id, name, public)
values ('participant-documents', 'participant-documents', false)
on conflict (id) do update set public = excluded.public;

-- No direct client storage access; edge functions use service role.
drop policy if exists participant_documents_storage_select_admin on storage.objects;
create policy participant_documents_storage_select_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'participant-documents'
    and public.portal_staff_profile_is_admin_or_ceo()
  );

comment on table public.portal_participant_documents is
  'PDFs and photos submitted by parents via public registration forms on Vercel.';
