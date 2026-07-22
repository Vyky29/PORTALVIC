-- Prospective clients / booking leads for the public Booking Portal gate.
-- Companion: supabase/migrations/20260722090000_portal_booking_leads.sql

begin;

create table if not exists public.portal_booking_leads (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null,
  email text not null,
  email_norm text generated always as (
    nullif(lower(trim(coalesce(email, ''))), '')
  ) stored,
  mobile text not null,
  phone_lookup text generated always as (
    right(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), 10)
  ) stored,
  marketing_consent boolean not null default false,
  privacy_notice_version text not null,
  privacy_accepted_at timestamptz not null default now(),
  source text not null default 'Booking Page',
  first_page_visited text,
  services_viewed text[] not null default '{}',
  last_activity_at timestamptz not null default now(),
  booking_status text not null default 'new_lead'
    check (booking_status in (
      'new_lead',
      'exploring_services',
      'registration_started',
      'registration_submitted',
      'booking_started',
      'booking_completed',
      'waiting_list',
      'no_booking'
    )),
  registration_status text not null default 'not_started'
    check (registration_status in (
      'not_started',
      'started',
      'submitted'
    )),
  client_status text not null default 'prospective'
    check (client_status in (
      'prospective',
      'registered',
      'active_client',
      'waiting_list',
      'closed'
    )),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists portal_booking_leads_email_norm_uidx
  on public.portal_booking_leads (email_norm)
  where email_norm is not null;

create index if not exists portal_booking_leads_phone_lookup_idx
  on public.portal_booking_leads (phone_lookup)
  where phone_lookup is not null and phone_lookup <> '';

create index if not exists portal_booking_leads_last_activity_idx
  on public.portal_booking_leads (last_activity_at desc);

create index if not exists portal_booking_leads_status_idx
  on public.portal_booking_leads (booking_status, created_at desc);

comment on table public.portal_booking_leads is
  'Prospective Client / Booking Lead captured on /bookingportal before exploring availability.';

create table if not exists public.portal_booking_lead_otps (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.portal_booking_leads (id) on delete cascade,
  code_hash text not null,
  channel text not null check (channel in ('email', 'log')),
  destination text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  ip_hash text,
  user_agent_hash text
);

create index if not exists portal_booking_lead_otps_lead_idx
  on public.portal_booking_lead_otps (lead_id, created_at desc);

create index if not exists portal_booking_lead_otps_open_idx
  on public.portal_booking_lead_otps (lead_id)
  where consumed_at is null;

create table if not exists public.portal_booking_lead_sessions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.portal_booking_leads (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  ip_hash text,
  user_agent_hash text,
  client_device text
);

create index if not exists portal_booking_lead_sessions_lead_idx
  on public.portal_booking_lead_sessions (lead_id, created_at desc);

create index if not exists portal_booking_lead_sessions_open_idx
  on public.portal_booking_lead_sessions (lead_id)
  where revoked_at is null;

alter table public.portal_booking_leads enable row level security;
alter table public.portal_booking_lead_otps enable row level security;
alter table public.portal_booking_lead_sessions enable row level security;

revoke all on table public.portal_booking_leads from public, anon, authenticated;
revoke all on table public.portal_booking_lead_otps from public, anon, authenticated;
revoke all on table public.portal_booking_lead_sessions from public, anon, authenticated;
grant all on table public.portal_booking_leads to service_role;
grant all on table public.portal_booking_lead_otps to service_role;
grant all on table public.portal_booking_lead_sessions to service_role;

commit;
