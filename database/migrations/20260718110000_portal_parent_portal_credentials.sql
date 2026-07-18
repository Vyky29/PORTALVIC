-- Mirror of supabase/migrations/20260718110000_portal_parent_portal_credentials.sql
\begin;

create table if not exists public.portal_parent_portal_credentials (
  parent_person_id text primary key,
  pin_hash text not null,
  pin_display text not null,
  changed_by_parent boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint portal_parent_portal_credentials_pin_display_chk
    check (pin_display ~ '^[0-9]{4}$')
);

comment on table public.portal_parent_portal_credentials is
  'Family portal login PIN (4 digits). pin_display is office-readable; pin_hash is used for auth.';

create index if not exists portal_parent_portal_credentials_updated_idx
  on public.portal_parent_portal_credentials (updated_at desc);

alter table public.portal_parent_portal_credentials enable row level security;

revoke all on public.portal_parent_portal_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.portal_parent_portal_credentials to service_role;

create table if not exists public.portal_parent_pin_attempts (
  id bigserial primary key,
  ip_hash text not null,
  name_norm text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists portal_parent_pin_attempts_ip_created_idx
  on public.portal_parent_pin_attempts (ip_hash, created_at desc);

alter table public.portal_parent_pin_attempts enable row level security;
revoke all on public.portal_parent_pin_attempts from public, anon, authenticated;
grant select, insert, delete on public.portal_parent_pin_attempts to service_role;

commit;
