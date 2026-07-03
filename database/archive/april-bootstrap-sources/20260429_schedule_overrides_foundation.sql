-- Admin Scheduling & Cover — backend foundation (single-day overrides).
-- Spreadsheet remains the source of truth; this layer stores operational overrides only.
--
-- ROLLBACK (manual):
--   begin;
--   drop policy if exists "schedule_override_events_admin_ceo_all" on public.schedule_override_events;
--   drop policy if exists "schedule_override_events_lead_select" on public.schedule_override_events;
--   drop policy if exists "schedule_override_events_staff_select_own_scope" on public.schedule_override_events;
--   drop policy if exists "schedule_overrides_admin_ceo_all" on public.schedule_overrides;
--   drop policy if exists "schedule_overrides_lead_select" on public.schedule_overrides;
--   drop policy if exists "schedule_overrides_staff_select_own_rota" on public.schedule_overrides;
--   drop function if exists public.portal_schedule_anchor_staff_matches_me(text);
--   alter table if exists public.schedule_override_events drop constraint if exists schedule_override_events_override_id_fkey;
--   drop table if exists public.schedule_override_events;
--   drop table if exists public.schedule_overrides;
--   commit;
-- Note: drop order — events first if FK from overrides → events; here events reference overrides, so events first.

begin;

-- ---------------------------------------------------------------------------
-- Helper: roster key aligned with dashboard logic (first word of username,
-- then full_name; lowercased; non-alphanumeric stripped). Not identical to
-- JS NFD normalisation; document in handoff if diacritics matter.
-- ---------------------------------------------------------------------------
create or replace function public.portal_schedule_anchor_staff_matches_me(p_anchor_staff_id text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead')
      and lower(regexp_replace(
        split_part(
          coalesce(nullif(trim(sp.username), ''), trim(sp.full_name)),
          ' ',
          1
        ),
        '[^a-z0-9]+',
        '',
        'g'
      )) = lower(trim(both from p_anchor_staff_id))
  );
$$;

comment on function public.portal_schedule_anchor_staff_matches_me(text) is
  'True when the signed-in user is staff or lead and the argument matches their derived roster key (spreadsheet staffId).';

-- ---------------------------------------------------------------------------
-- 1. schedule_overrides
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) default auth.uid(),
  updated_by uuid not null references auth.users (id) default auth.uid(),
  session_date date not null,
  anchor_staff_id text not null,
  anchor_start time not null,
  anchor_end time not null,
  anchor_venue text not null,
  anchor_client_id text not null,
  anchor_time_slot_label text not null default '',
  override_type text not null,
  payload jsonb not null default '{}'::jsonb,
  reason text null,
  status text not null default 'active',
  superseded_by uuid null references public.schedule_overrides (id) on delete set null,
  spreadsheet_revision text null,
  constraint schedule_overrides_override_type_check
    check (
      override_type in (
        'client_absence_announced',
        'slot_clear_client',
        'client_replace_in_slot',
        'instructor_reassign',
        'slot_close',
        'override_void'
      )
    ),
  constraint schedule_overrides_status_check
    check (status in ('active', 'cancelled'))
);

comment on table public.schedule_overrides is
  'Single-day operational overrides over spreadsheet-derived sessions; dashboards merge later. V1: filter by session_date only (no date range on row).';

create index if not exists schedule_overrides_session_date_status_idx
  on public.schedule_overrides (session_date, status);

create index if not exists schedule_overrides_anchor_staff_session_date_idx
  on public.schedule_overrides (anchor_staff_id, session_date);

create index if not exists schedule_overrides_override_type_session_date_idx
  on public.schedule_overrides (override_type, session_date);

create index if not exists schedule_overrides_superseded_by_idx
  on public.schedule_overrides (superseded_by)
  where superseded_by is not null;

create index if not exists schedule_overrides_created_by_idx
  on public.schedule_overrides (created_by);

-- Keep updated_* coherent on row changes (optional for API-only updates).
create or replace function public.schedule_overrides_set_updated()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists schedule_overrides_set_updated_trg on public.schedule_overrides;
create trigger schedule_overrides_set_updated_trg
before update on public.schedule_overrides
for each row
execute function public.schedule_overrides_set_updated();

-- ---------------------------------------------------------------------------
-- 2. schedule_override_events (append-only audit; application inserts rows)
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_override_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid not null references auth.users (id) default auth.uid(),
  override_id uuid not null references public.schedule_overrides (id) on delete restrict,
  action text not null,
  before_snapshot jsonb null,
  after_snapshot jsonb null,
  client_context jsonb null,
  constraint schedule_override_events_action_check
    check (action in ('create', 'update', 'void', 'supersede'))
);

comment on table public.schedule_override_events is
  'Append-only audit log for schedule_overrides; RLS mirrors read scope of overrides.';

create index if not exists schedule_override_events_override_id_idx
  on public.schedule_override_events (override_id);

create index if not exists schedule_override_events_created_at_idx
  on public.schedule_override_events (created_at desc);

create index if not exists schedule_override_events_actor_id_idx
  on public.schedule_override_events (actor_id);

-- ---------------------------------------------------------------------------
-- Grants: RLS enforces row access; no anon.
-- ---------------------------------------------------------------------------
revoke all on public.schedule_overrides from public;
revoke all on public.schedule_override_events from public;
revoke all on public.schedule_overrides from anon;
revoke all on public.schedule_override_events from anon;

grant select, insert, update, delete on public.schedule_overrides to authenticated;
grant select, insert on public.schedule_override_events to authenticated;

-- Helper executed inside policies; staff must be able to invoke it.
grant execute on function public.portal_schedule_anchor_staff_matches_me(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: schedule_overrides
-- ---------------------------------------------------------------------------
alter table public.schedule_overrides enable row level security;

drop policy if exists "schedule_overrides_admin_ceo_all" on public.schedule_overrides;
create policy "schedule_overrides_admin_ceo_all"
on public.schedule_overrides
for all
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "schedule_overrides_lead_select" on public.schedule_overrides;
-- Lead: same visibility as staff — own anchor rows + instructor_reassign where they are covering.
create policy "schedule_overrides_lead_select"
on public.schedule_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role = 'lead'
      and (
        public.portal_schedule_anchor_staff_matches_me(anchor_staff_id)
        or (
          override_type = 'instructor_reassign'
          and nullif(trim(payload ->> 'covering_staff_id'), '') is not null
          and public.portal_schedule_anchor_staff_matches_me(trim(payload ->> 'covering_staff_id'))
        )
      )
  )
);

drop policy if exists "schedule_overrides_staff_select_own_rota" on public.schedule_overrides;
create policy "schedule_overrides_staff_select_own_rota"
on public.schedule_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role = 'staff'
      and (
        public.portal_schedule_anchor_staff_matches_me(anchor_staff_id)
        or (
          override_type = 'instructor_reassign'
          and nullif(trim(payload ->> 'covering_staff_id'), '') is not null
          and public.portal_schedule_anchor_staff_matches_me(trim(payload ->> 'covering_staff_id'))
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- RLS: schedule_override_events
-- ---------------------------------------------------------------------------
alter table public.schedule_override_events enable row level security;

drop policy if exists "schedule_override_events_admin_ceo_all" on public.schedule_override_events;
create policy "schedule_override_events_admin_ceo_all"
on public.schedule_override_events
for all
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "schedule_override_events_lead_select" on public.schedule_override_events;
create policy "schedule_override_events_lead_select"
on public.schedule_override_events
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role = 'lead'
  )
  and exists (
    select 1
    from public.schedule_overrides o
    where o.id = schedule_override_events.override_id
  )
);

drop policy if exists "schedule_override_events_staff_select_own_scope" on public.schedule_override_events;
create policy "schedule_override_events_staff_select_own_scope"
on public.schedule_override_events
for select
to authenticated
using (
  exists (
    select 1
    from public.schedule_overrides o
    where o.id = override_id
      and (
        public.portal_schedule_anchor_staff_matches_me(o.anchor_staff_id)
        or (
          o.override_type = 'instructor_reassign'
          and nullif(trim(o.payload ->> 'covering_staff_id'), '') is not null
          and public.portal_schedule_anchor_staff_matches_me(trim(o.payload ->> 'covering_staff_id'))
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- WHAT FRONTEND / API MUST DO LATER (not in this migration)
-- ---------------------------------------------------------------------------
-- 1. After bootstrap from spreadsheet, fetch schedule_overrides for the view
--    session_date (single day) and merge into effectiveSessions in JS.
-- 2. Admin UI: insert/update schedule_overrides; append schedule_override_events
--    with action create|update|void|supersede and JSON snapshots.
-- 3. instructor_reassign: set payload.covering_staff_id to the covering roster key
--    (same normalisation as anchor_staff_id) so RLS lets that staff read the row.
-- 4. Pass spreadsheet_revision from the bundle version string when writing overrides.
-- 5. override_void: application sets target row status cancelled / superseded_by;
--    log a schedule_override_events row with action void or supersede.
-- 6. Leads currently see all overrides; add venue or site keys to the row if you
--    need lead RLS to match operational territory.

commit;
