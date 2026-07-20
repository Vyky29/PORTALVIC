-- Persist rotating Xero refresh token so Edge cold starts do not invalidate OAuth.
create table if not exists public.portal_xero_oauth (
  id int primary key default 1 check (id = 1),
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

comment on table public.portal_xero_oauth is
  'Singleton row: latest Xero OAuth refresh_token (rotates on each use).';

alter table public.portal_xero_oauth enable row level security;
revoke all on public.portal_xero_oauth from public, anon, authenticated;
grant select, insert, update, delete on public.portal_xero_oauth to service_role;
