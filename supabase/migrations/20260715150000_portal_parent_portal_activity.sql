-- Parent portal activity trail for CEO presence monitoring.
alter table public.portal_parent_portal_sessions
  add column if not exists last_surface text,
  add column if not exists last_contact_id text;

create table if not exists public.portal_parent_portal_activity (
  id uuid primary key default gen_random_uuid(),
  parent_person_id text not null,
  contact_id text,
  event_type text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists portal_parent_portal_activity_created_idx
  on public.portal_parent_portal_activity (created_at desc);

create index if not exists portal_parent_portal_activity_parent_created_idx
  on public.portal_parent_portal_activity (parent_person_id, created_at desc);

alter table public.portal_parent_portal_activity enable row level security;

revoke all on table public.portal_parent_portal_activity from public, anon, authenticated;
grant all on table public.portal_parent_portal_activity to service_role;
