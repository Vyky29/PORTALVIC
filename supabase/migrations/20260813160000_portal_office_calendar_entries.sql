-- Office calendar: meetings, notes, events for portal admins (shared visibility).

begin;

create table if not exists public.portal_office_calendar_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  entry_type text not null
    check (entry_type in ('meeting', 'note', 'event')),
  title text not null,
  body text,
  start_time time without time zone,
  end_time time without time zone,
  all_day boolean not null default true,
  created_by uuid,
  created_by_name text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portal_office_calendar_entries is
  'Shared office calendar for portal admins — meetings, notes and events.';

create index if not exists portal_office_calendar_entries_date_idx
  on public.portal_office_calendar_entries (entry_date desc);

create index if not exists portal_office_calendar_entries_type_date_idx
  on public.portal_office_calendar_entries (entry_type, entry_date desc);

alter table public.portal_office_calendar_entries enable row level security;

-- No direct anon/authenticated client access; Edge Functions use service role.
drop policy if exists portal_office_calendar_entries_deny_all on public.portal_office_calendar_entries;
create policy portal_office_calendar_entries_deny_all
on public.portal_office_calendar_entries
for all
to authenticated
using (false)
with check (false);

grant select, insert, update, delete on public.portal_office_calendar_entries to service_role;

commit;
