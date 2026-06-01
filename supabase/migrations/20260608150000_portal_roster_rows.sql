-- Mirror of database/migrations/20260608150000_portal_roster_rows.sql

begin;

create table if not exists public.portal_roster_rows (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) default auth.uid(),
  updated_by uuid not null references auth.users (id) default auth.uid(),
  client_name text not null,
  day text not null,
  time_slot text not null,
  instructors text not null default '',
  service text not null default '',
  area text not null default '',
  venue text not null default '',
  session_date date null,
  status text not null default 'active',
  constraint portal_roster_rows_status_check
    check (status in ('active', 'cancelled'))
);

comment on table public.portal_roster_rows is
  'Term timetable layer: session_date NULL = weekly template; dated row = single-day exception. Dashboards merge over spreadsheet bundle.';

comment on column public.portal_roster_rows.session_date is
  'NULL = applies every matching weekday in term projection; set = overrides bundle for that calendar date only.';

create unique index if not exists portal_roster_rows_template_active_uidx
  on public.portal_roster_rows (
    lower(trim(day)),
    lower(trim(client_name)),
    lower(trim(time_slot))
  )
  where session_date is null and status = 'active';

create unique index if not exists portal_roster_rows_dated_active_uidx
  on public.portal_roster_rows (
    session_date,
    lower(trim(client_name)),
    lower(trim(time_slot))
  )
  where session_date is not null and status = 'active';

create index if not exists portal_roster_rows_session_date_status_idx
  on public.portal_roster_rows (session_date, status)
  where session_date is not null;

create index if not exists portal_roster_rows_day_status_idx
  on public.portal_roster_rows (lower(trim(day)), status)
  where session_date is null;

create or replace function public.portal_roster_rows_set_updated()
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

drop trigger if exists portal_roster_rows_set_updated_trg on public.portal_roster_rows;
create trigger portal_roster_rows_set_updated_trg
before update on public.portal_roster_rows
for each row
execute function public.portal_roster_rows_set_updated();

create table if not exists public.portal_roster_row_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid not null references auth.users (id) default auth.uid(),
  roster_row_id uuid null references public.portal_roster_rows (id) on delete set null,
  action text not null,
  scope text not null,
  anchor_session_date date null,
  before_snapshot jsonb null,
  after_snapshot jsonb null,
  client_context jsonb null,
  constraint portal_roster_row_events_action_check
    check (action in ('create', 'update', 'cancel')),
  constraint portal_roster_row_events_scope_check
    check (scope in ('single_day', 'weekday_term', 'rest_of_term'))
);

comment on table public.portal_roster_row_events is
  'Append-only audit for portal_roster_rows saves (scope = how many dates the edit applied to).';

create index if not exists portal_roster_row_events_created_at_idx
  on public.portal_roster_row_events (created_at desc);

create index if not exists portal_roster_row_events_roster_row_id_idx
  on public.portal_roster_row_events (roster_row_id);

revoke all on public.portal_roster_rows from public, anon;
revoke all on public.portal_roster_row_events from public, anon;

grant select, insert, update, delete on public.portal_roster_rows to authenticated;
grant select, insert on public.portal_roster_row_events to authenticated;

alter table public.portal_roster_rows enable row level security;
alter table public.portal_roster_row_events enable row level security;

drop policy if exists "portal_roster_rows_admin_ceo_all" on public.portal_roster_rows;
create policy "portal_roster_rows_admin_ceo_all"
on public.portal_roster_rows
for all
to authenticated
using (public.portal_staff_profile_is_admin_or_ceo())
with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_roster_rows_staff_lead_select" on public.portal_roster_rows;
create policy "portal_roster_rows_staff_lead_select"
on public.portal_roster_rows
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead')
  )
);

drop policy if exists "portal_roster_row_events_admin_ceo_all" on public.portal_roster_row_events;
create policy "portal_roster_row_events_admin_ceo_all"
on public.portal_roster_row_events
for all
to authenticated
using (public.portal_staff_profile_is_admin_or_ceo())
with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_roster_row_events_staff_lead_select" on public.portal_roster_row_events;
create policy "portal_roster_row_events_staff_lead_select"
on public.portal_roster_row_events
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead', 'admin', 'ceo')
  )
);

commit;
