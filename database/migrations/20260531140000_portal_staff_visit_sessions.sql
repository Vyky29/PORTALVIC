-- Staff portal visit sessions (login, pages, active-tab time) for admin Portal Activity view.

begin;

create table if not exists public.portal_staff_visit_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  staff_display_name text not null default '',
  staff_surface text not null default 'staff',
  session_date date not null,
  login_at timestamptz not null default now(),
  logout_at timestamptz null,
  last_seen_at timestamptz not null default now(),
  last_page_label text not null default '',
  active_tab_ms bigint not null default 0,
  total_ms bigint not null default 0,
  pages jsonb not null default '[]'::jsonb,
  form_submits jsonb not null default '[]'::jsonb,
  still_open boolean not null default true
);

comment on table public.portal_staff_visit_sessions is
  'Browser visit sessions for staff/lead/admin portal shells: login/logout, page trail, active-tab time.';

create index if not exists portal_staff_visit_sessions_date_idx
  on public.portal_staff_visit_sessions (session_date desc, login_at desc);

create index if not exists portal_staff_visit_sessions_user_date_idx
  on public.portal_staff_visit_sessions (staff_user_id, session_date desc);

create or replace function public.portal_staff_visit_sessions_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portal_staff_visit_sessions_touch on public.portal_staff_visit_sessions;
create trigger portal_staff_visit_sessions_touch
  before update on public.portal_staff_visit_sessions
  for each row execute function public.portal_staff_visit_sessions_touch_updated_at();

alter table public.portal_staff_visit_sessions enable row level security;

grant select, insert, update on table public.portal_staff_visit_sessions to authenticated;

drop policy if exists "portal_visit_sessions_select_admin" on public.portal_staff_visit_sessions;
create policy "portal_visit_sessions_select_admin"
  on public.portal_staff_visit_sessions
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_visit_sessions_insert_own" on public.portal_staff_visit_sessions;
create policy "portal_visit_sessions_insert_own"
  on public.portal_staff_visit_sessions
  for insert
  to authenticated
  with check (staff_user_id = auth.uid());

drop policy if exists "portal_visit_sessions_update_own" on public.portal_staff_visit_sessions;
create policy "portal_visit_sessions_update_own"
  on public.portal_staff_visit_sessions
  for update
  to authenticated
  using (staff_user_id = auth.uid())
  with check (staff_user_id = auth.uid());

commit;
