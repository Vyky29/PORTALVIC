-- Staff hours overrides (Staff Timetable spreadsheet grid). Merged in admin + term calendar at read time.
begin;

create table if not exists public.portal_staff_timetable_cells (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) default auth.uid(),
  updated_by uuid not null references auth.users (id) default auth.uid(),
  session_date date not null,
  day text not null,
  column_key text not null,
  raw_assignment text not null default '',
  status text not null default 'active',
  constraint portal_staff_timetable_cells_status_check
    check (status in ('active', 'cleared'))
);

comment on table public.portal_staff_timetable_cells is
  'Per-date staff pool timetable cell (spreadsheet Staff hours). Overrides staff_timetable_machine / reference export.';

create unique index if not exists portal_staff_timetable_cells_date_col_uidx
  on public.portal_staff_timetable_cells (session_date, column_key);

create index if not exists portal_staff_timetable_cells_day_idx
  on public.portal_staff_timetable_cells (lower(trim(day)), session_date);

create or replace function public.portal_staff_timetable_cells_set_updated()
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

drop trigger if exists portal_staff_timetable_cells_set_updated_trg on public.portal_staff_timetable_cells;
create trigger portal_staff_timetable_cells_set_updated_trg
before update on public.portal_staff_timetable_cells
for each row
execute function public.portal_staff_timetable_cells_set_updated();

revoke all on public.portal_staff_timetable_cells from public, anon;
grant select, insert, update, delete on public.portal_staff_timetable_cells to authenticated;

alter table public.portal_staff_timetable_cells enable row level security;

drop policy if exists "portal_staff_timetable_cells_admin_ceo_all" on public.portal_staff_timetable_cells;
create policy "portal_staff_timetable_cells_admin_ceo_all"
on public.portal_staff_timetable_cells
for all
to authenticated
using (public.portal_staff_profile_is_admin_or_ceo())
with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "portal_staff_timetable_cells_staff_lead_select" on public.portal_staff_timetable_cells;
create policy "portal_staff_timetable_cells_staff_lead_select"
on public.portal_staff_timetable_cells
for select
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('staff', 'lead', 'admin', 'ceo')
  )
);

commit;
