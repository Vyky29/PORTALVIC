-- Staff training progress (induction modules, swimming tracks) + device/setup readiness for admin.

begin;

create table if not exists public.portal_staff_training_progress (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  track text not null,
  current_module smallint not null default 0,
  modules_total smallint not null default 0,
  progress_pct smallint not null default 0,
  module_states jsonb not null default '{}'::jsonb,
  phase_label text not null default '',
  time_on_track_ms bigint not null default 0,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint portal_staff_training_progress_track_chk
    check (track in ('induction', 'swimming_training', 'swimming_term_review')),
  constraint portal_staff_training_progress_pct_chk
    check (progress_pct >= 0 and progress_pct <= 100),
  constraint portal_staff_training_progress_staff_track_uidx unique (staff_user_id, track)
);

comment on table public.portal_staff_training_progress is
  'Per-staff training track progress synced from portal devices (induction modules, swimming training, term review).';

create index if not exists portal_staff_training_progress_track_idx
  on public.portal_staff_training_progress (track, updated_at desc);

create table if not exists public.portal_staff_setup_status (
  staff_user_id uuid primary key references auth.users (id) on delete cascade,
  staff_display_name text not null default '',
  is_pwa boolean not null default false,
  push_enabled boolean not null default false,
  location_granted boolean not null default false,
  microphone_granted boolean not null default false,
  last_shell text not null default 'browser',
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_meta jsonb not null default '{}'::jsonb
);

comment on table public.portal_staff_setup_status is
  'Latest portal app readiness per staff user: PWA vs browser, alerts, map location, microphone.';

create or replace function public.portal_staff_training_progress_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portal_staff_training_progress_touch on public.portal_staff_training_progress;
create trigger portal_staff_training_progress_touch
  before update on public.portal_staff_training_progress
  for each row execute function public.portal_staff_training_progress_touch_updated_at();

create or replace function public.portal_staff_setup_status_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portal_staff_setup_status_touch on public.portal_staff_setup_status;
create trigger portal_staff_setup_status_touch
  before update on public.portal_staff_setup_status
  for each row execute function public.portal_staff_setup_status_touch_updated_at();

alter table public.portal_staff_training_progress enable row level security;
alter table public.portal_staff_setup_status enable row level security;

grant select, insert, update on table public.portal_staff_training_progress to authenticated;
grant select, insert, update on table public.portal_staff_setup_status to authenticated;

drop policy if exists "portal_training_progress_select_admin" on public.portal_staff_training_progress;
create policy "portal_training_progress_select_admin"
  on public.portal_staff_training_progress for select to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_training_progress_upsert_own" on public.portal_staff_training_progress;
create policy "portal_training_progress_upsert_own"
  on public.portal_staff_training_progress for insert to authenticated
  with check (staff_user_id = auth.uid());

drop policy if exists "portal_training_progress_update_own" on public.portal_staff_training_progress;
create policy "portal_training_progress_update_own"
  on public.portal_staff_training_progress for update to authenticated
  using (staff_user_id = auth.uid())
  with check (staff_user_id = auth.uid());

drop policy if exists "portal_setup_status_select_admin" on public.portal_staff_setup_status;
create policy "portal_setup_status_select_admin"
  on public.portal_staff_setup_status for select to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_setup_status_upsert_own" on public.portal_staff_setup_status;
create policy "portal_setup_status_upsert_own"
  on public.portal_staff_setup_status for insert to authenticated
  with check (staff_user_id = auth.uid());

drop policy if exists "portal_setup_status_update_own" on public.portal_staff_setup_status;
create policy "portal_setup_status_update_own"
  on public.portal_staff_setup_status for update to authenticated
  using (staff_user_id = auth.uid())
  with check (staff_user_id = auth.uid());

commit;
