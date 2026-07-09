-- Duplicate of supabase/migrations/20260709200000_portal_participant_parent_consents_offsite_annual.sql
-- Off-site / transport consents + annual renewal support (signed_at freshness).

begin;

alter table public.portal_participant_parent_consents
  add column if not exists community_walk_consent text not null default 'unknown'
    check (community_walk_consent in ('yes', 'no', 'unknown'));

alter table public.portal_participant_parent_consents
  add column if not exists public_transport_consent text not null default 'unknown'
    check (public_transport_consent in ('yes', 'no', 'unknown'));

alter table public.portal_participant_parent_consents
  add column if not exists taxi_home_transport_consent text not null default 'unknown'
    check (taxi_home_transport_consent in ('yes', 'no', 'unknown'));

alter table public.portal_participant_parent_consents
  add column if not exists offsite_transport_signed_at timestamptz null;

alter table public.portal_participant_parent_consents
  add column if not exists offsite_transport_signed_by_name text not null default '';

alter table public.portal_participant_parent_consents_log
  add column if not exists community_walk_consent text null;

alter table public.portal_participant_parent_consents_log
  add column if not exists public_transport_consent text null;

alter table public.portal_participant_parent_consents_log
  add column if not exists taxi_home_transport_consent text null;

alter table public.portal_participant_parent_consents_log
  add column if not exists offsite_transport_signed_at timestamptz null;

alter table public.portal_participant_parent_consents_log
  add column if not exists offsite_transport_signed_by_name text null;

comment on table public.portal_participant_parent_consents is
  'Parent-signed consents: photo/marketing, medication, emergency, off-site/transport. Annual renewal via signed_at freshness (365 days).';

commit;
