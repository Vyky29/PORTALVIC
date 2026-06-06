-- Admin ghost view (teleport): short-lived tokens to open a worker dashboard read-only.

begin;

create table if not exists public.portal_admin_ghost_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_user_id uuid not null references auth.users (id) on delete cascade,
  target_staff_user_id uuid not null references auth.users (id) on delete cascade,
  target_roster_key text not null default '',
  target_display_name text not null default '',
  surface text not null default 'staff',
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null
);

comment on table public.portal_admin_ghost_sessions is
  'Short-lived hashed tokens for admin ghost view of staff/lead dashboards (read-only mirror).';

create unique index if not exists portal_admin_ghost_sessions_token_hash_uidx
  on public.portal_admin_ghost_sessions (token_hash);

create index if not exists portal_admin_ghost_sessions_admin_idx
  on public.portal_admin_ghost_sessions (admin_user_id, created_at desc);

create index if not exists portal_admin_ghost_sessions_target_idx
  on public.portal_admin_ghost_sessions (target_staff_user_id, created_at desc);

create table if not exists public.portal_admin_ghost_view_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_user_id uuid not null,
  admin_email text not null default '',
  target_staff_user_id uuid not null,
  target_roster_key text not null default '',
  target_display_name text not null default '',
  surface text not null default 'staff',
  action text not null default 'start',
  client_ip text not null default ''
);

comment on table public.portal_admin_ghost_view_log is
  'Audit trail when admins start or verify ghost dashboard view sessions.';

create index if not exists portal_admin_ghost_view_log_created_idx
  on public.portal_admin_ghost_view_log (created_at desc);

create index if not exists portal_admin_ghost_view_log_target_idx
  on public.portal_admin_ghost_view_log (target_staff_user_id, created_at desc);

alter table public.portal_admin_ghost_sessions enable row level security;
alter table public.portal_admin_ghost_view_log enable row level security;

revoke all on table public.portal_admin_ghost_sessions from public;
revoke all on table public.portal_admin_ghost_view_log from public;

grant select on table public.portal_admin_ghost_view_log to authenticated;

drop policy if exists "portal_admin_ghost_log_select_admin" on public.portal_admin_ghost_view_log;
create policy "portal_admin_ghost_log_select_admin"
  on public.portal_admin_ghost_view_log
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

commit;
