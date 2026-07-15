-- Parent portal activity trail for CEO “who’s in the portal / what they’re touching”.
-- Safe for empty projects: additive only; service_role writes via Edge Functions.

alter table public.portal_parent_portal_sessions
  add column if not exists last_surface text,
  add column if not exists last_contact_id text;

comment on column public.portal_parent_portal_sessions.last_surface is
  'Last parent hub/surface pinged from the Family portal (e.g. hub, sessions, messages).';
comment on column public.portal_parent_portal_sessions.last_contact_id is
  'Participant contact_id associated with the last surface ping.';

create table if not exists public.portal_parent_portal_activity (
  id uuid primary key default gen_random_uuid(),
  parent_person_id text not null,
  contact_id text,
  event_type text not null,
  detail text,
  created_at timestamptz not null default now()
);

comment on table public.portal_parent_portal_activity is
  'Lightweight parent-portal surface / action pings for CEO presence monitoring.';

create index if not exists portal_parent_portal_activity_created_idx
  on public.portal_parent_portal_activity (created_at desc);

create index if not exists portal_parent_portal_activity_parent_created_idx
  on public.portal_parent_portal_activity (parent_person_id, created_at desc);

alter table public.portal_parent_portal_activity enable row level security;

revoke all on table public.portal_parent_portal_activity from public, anon, authenticated;
grant all on table public.portal_parent_portal_activity to service_role;
