-- Add emergency treatment consent + emergency contact fields to parent consents.

begin;

alter table public.portal_participant_parent_consents
  add column if not exists emergency_treatment_consent text not null default 'unknown'
    check (emergency_treatment_consent in ('yes', 'no', 'unknown'));

alter table public.portal_participant_parent_consents
  add column if not exists emergency_treatment_signed_at timestamptz null;

alter table public.portal_participant_parent_consents
  add column if not exists emergency_treatment_signed_by_name text not null default '';

alter table public.portal_participant_parent_consents
  add column if not exists emergency_contact_name text not null default '';

alter table public.portal_participant_parent_consents
  add column if not exists emergency_contact_phone text not null default '';

alter table public.portal_participant_parent_consents_log
  add column if not exists emergency_treatment_consent text null;

alter table public.portal_participant_parent_consents_log
  add column if not exists emergency_treatment_signed_at timestamptz null;

alter table public.portal_participant_parent_consents_log
  add column if not exists emergency_treatment_signed_by_name text null;

alter table public.portal_participant_parent_consents_log
  add column if not exists emergency_contact_name text null;

alter table public.portal_participant_parent_consents_log
  add column if not exists emergency_contact_phone text null;

comment on table public.portal_participant_parent_consents is
  'Parent-signed photo/marketing, medication-at-centre, and emergency treatment consents.';

commit;
