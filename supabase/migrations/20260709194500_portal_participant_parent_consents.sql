-- Parent-signed consents (photo / media + medication at centre).
-- Written only via parent-portal Edge Functions (service role). Staff can read.

begin;

create table if not exists public.portal_participant_parent_consents (
  contact_id text primary key
    references public.portal_participants (contact_id) on delete cascade,

  photo_consent text not null default 'unknown'
    check (photo_consent in ('yes', 'no', 'internal_only', 'unknown')),
  photo_consent_signed_at timestamptz null,
  photo_consent_signed_by_name text not null default '',

  medication_at_centre_needed text not null default 'unknown'
    check (medication_at_centre_needed in ('yes', 'no', 'unknown')),
  medication_at_centre_details text not null default '',
  medication_at_centre_signed_at timestamptz null,
  medication_at_centre_signed_by_name text not null default '',

  updated_at timestamptz not null default now(),
  updated_by_parent_person_id text null
);

create index if not exists portal_participant_parent_consents_updated_idx
  on public.portal_participant_parent_consents (updated_at desc);

comment on table public.portal_participant_parent_consents is
  'Parent-signed photo/media and medication-at-centre consents (one row per participant).';

create table if not exists public.portal_participant_parent_consents_log (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null,
  parent_person_id text null,
  photo_consent text null,
  photo_consent_signed_at timestamptz null,
  photo_consent_signed_by_name text null,
  medication_at_centre_needed text null,
  medication_at_centre_details text null,
  medication_at_centre_signed_at timestamptz null,
  medication_at_centre_signed_by_name text null,
  created_at timestamptz not null default now()
);

create index if not exists portal_participant_parent_consents_log_contact_idx
  on public.portal_participant_parent_consents_log (contact_id, created_at desc);

alter table public.portal_participant_parent_consents enable row level security;
alter table public.portal_participant_parent_consents_log enable row level security;

revoke all on public.portal_participant_parent_consents from public, anon, authenticated;
revoke all on public.portal_participant_parent_consents_log from public, anon, authenticated;

grant select on public.portal_participant_parent_consents to authenticated;
grant select, insert, update on public.portal_participant_parent_consents to service_role;
grant select, insert on public.portal_participant_parent_consents_log to service_role;

drop policy if exists portal_participant_parent_consents_select_staff
  on public.portal_participant_parent_consents;
create policy portal_participant_parent_consents_select_staff
  on public.portal_participant_parent_consents
  for select
  to authenticated
  using (
    public.portal_staff_is_staff_or_lead()
    or public.portal_staff_profile_is_admin_or_ceo()
  );

drop policy if exists portal_participant_parent_consents_log_select_staff
  on public.portal_participant_parent_consents_log;
create policy portal_participant_parent_consents_log_select_staff
  on public.portal_participant_parent_consents_log
  for select
  to authenticated
  using (
    public.portal_staff_is_staff_or_lead()
    or public.portal_staff_profile_is_admin_or_ceo()
  );

commit;
