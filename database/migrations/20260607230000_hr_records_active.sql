-- HR people active/inactive flag (HR-only label; does NOT affect app login).
-- Lets the admin filter every H&R category by Active (default) / All / Inactive,
-- and toggle a person inactive from the admin app. Kept per-row so any sheet can
-- be filtered directly; toggling a person updates all rows sharing their name_key.

begin;

alter table public.hr_records
  add column if not exists active boolean not null default true;

create index if not exists hr_records_active_idx on public.hr_records (active);

commit;
