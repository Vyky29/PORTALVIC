-- Anonymous Booking Service visitor sessions (new clients, not Family portal).
create table if not exists public.portal_booking_service_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz null,
  last_surface text null,
  last_detail text null,
  client_device text null,
  geo_country text null,
  geo_region text null,
  geo_city text null,
  geo_bucket text null,
  geo_lat double precision null,
  geo_lng double precision null,
  geo_label text null,
  ip_hash text null,
  user_agent_hash text null
);

create index if not exists portal_booking_service_sessions_last_used_idx
  on public.portal_booking_service_sessions (last_used_at desc);

create index if not exists portal_booking_service_sessions_token_idx
  on public.portal_booking_service_sessions (token_hash);

create table if not exists public.portal_booking_service_activity (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.portal_booking_service_sessions (id) on delete cascade,
  event_type text not null,
  detail text null,
  created_at timestamptz not null default now()
);

create index if not exists portal_booking_service_activity_created_idx
  on public.portal_booking_service_activity (created_at desc);

create index if not exists portal_booking_service_activity_session_idx
  on public.portal_booking_service_activity (session_id, created_at desc);

alter table public.portal_booking_service_sessions enable row level security;
alter table public.portal_booking_service_activity enable row level security;

revoke all on table public.portal_booking_service_sessions from public, anon, authenticated;
revoke all on table public.portal_booking_service_activity from public, anon, authenticated;
grant all on table public.portal_booking_service_sessions to service_role;
grant all on table public.portal_booking_service_activity to service_role;
