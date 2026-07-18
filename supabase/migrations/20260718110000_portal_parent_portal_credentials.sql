-- Parent portal login PIN (4 digits) per parent_person_id.
-- Siblings / co-parents share the same pin_display (synced by Edge Functions).
-- Admin can read pin_display; auth verifies pin_hash.

begin;

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

comment on column public.portal_parent_portal_credentials.pin_display is
  'Current 4-digit PIN in plain form for office lookup only (service_role / admin APIs).';

create index if not exists portal_parent_portal_credentials_updated_idx
  on public.portal_parent_portal_credentials (updated_at desc);

alter table public.portal_parent_portal_credentials enable row level security;

revoke all on public.portal_parent_portal_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.portal_parent_portal_credentials to service_role;

-- Optional: failed PIN attempts for soft rate-limit (service_role only).
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
