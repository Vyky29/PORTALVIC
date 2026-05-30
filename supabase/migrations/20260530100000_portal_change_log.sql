-- Change log (audit trail) for the admin app.
-- Records every edit made in the portal so it can be tracked forever, grouped
-- by day on the "Activity log" page: WHEN (date) · WHAT TIME · BY WHOM · WHAT.
--
-- Append-only by design: rows are inserted by the admin app on save and never
-- updated/deleted from the UI. Contains record names / field values => RLS locks
-- it to admin / CEO (same gate as client_payments / hr_records).

begin;

create table if not exists public.change_log (
  id           uuid primary key default gen_random_uuid(),
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,                         -- staff_profiles.id of who made the change
  actor_name   text,                         -- display name captured at write time
  actor_role   text,                         -- admin / ceo / …
  area         text,                         -- "Payments", "Staff & HR", …
  entity       text,                         -- record the change was about (client / person)
  action       text,                         -- create / update / delete
  summary      text,                         -- human-readable "what changed"
  details      jsonb not null default '{}'::jsonb, -- structured field diffs
  source       text                          -- optional: page / module id
);

comment on table public.change_log is
  'Append-only audit trail of admin edits (who/when/what). Admin/CEO only.';

create index if not exists change_log_occurred_idx on public.change_log (occurred_at desc);
create index if not exists change_log_area_idx     on public.change_log (area);
create index if not exists change_log_actor_idx    on public.change_log (actor_id);

alter table public.change_log enable row level security;

grant select, insert on table public.change_log to authenticated;

-- Admin / CEO can read the whole trail.
drop policy if exists "change_log_admin_read" on public.change_log;
create policy "change_log_admin_read"
on public.change_log
for select
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

-- Admin / CEO can append rows; actor_id must be themselves.
drop policy if exists "change_log_admin_insert" on public.change_log;
create policy "change_log_admin_insert"
on public.change_log
for insert
to authenticated
with check (
  (actor_id is null or actor_id = auth.uid())
  and exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

commit;
