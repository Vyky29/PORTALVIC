-- Office calendar: mark entries Done (open | done).

begin;

alter table public.portal_office_calendar_entries
  add column if not exists status text not null default 'open';

alter table public.portal_office_calendar_entries
  drop constraint if exists portal_office_calendar_entries_status_check;

alter table public.portal_office_calendar_entries
  add constraint portal_office_calendar_entries_status_check
  check (status in ('open', 'done'));

alter table public.portal_office_calendar_entries
  add column if not exists done_at timestamptz null;

alter table public.portal_office_calendar_entries
  add column if not exists done_by uuid null;

comment on column public.portal_office_calendar_entries.status is
  'open = active office item; done = completed / checked off.';

create index if not exists portal_office_calendar_entries_status_date_idx
  on public.portal_office_calendar_entries (status, entry_date desc);

commit;
