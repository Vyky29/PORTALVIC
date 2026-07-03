-- HR matrix store (fed by the STAFF MATRIX spreadsheet).
-- One row per spreadsheet row, grouped by `sheet`. Heterogeneous columns are
-- kept in `data` (jsonb) so the source workbook can evolve without schema churn.
-- Contains PII (DOB, addresses, health, bank, emergency contacts) => RLS locks
-- it to admin / CEO only. Data is loaded locally from hr_source/ (never committed,
-- never deployed). The browser uses only the anon key + this RLS.

begin;

-- Normalised name key (lowercase, accent-folded, alphanumerics only) used to
-- match spreadsheet people to staff_profiles. Python importer mirrors this.
create or replace function public.hr_name_key(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(translate(coalesce(p, ''),
      'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
      'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')),
    '[^a-z0-9]', '', 'g')
$$;

create table if not exists public.hr_records (
  id            uuid primary key default gen_random_uuid(),
  sheet         text not null,
  row_index     integer,
  name_key      text,
  employee_name text,
  staff_id      uuid references public.staff_profiles (id) on delete set null,
  data          json not null default '{}'::json, -- json (not jsonb) to preserve column order for the admin view

  source_file   text,
  imported_at   timestamptz not null default now()
);

comment on table public.hr_records is
  'HR matrix rows imported from the STAFF MATRIX workbook. Admin/CEO only (PII).';

create index if not exists hr_records_sheet_idx     on public.hr_records (sheet);
create index if not exists hr_records_name_key_idx  on public.hr_records (name_key);
create index if not exists hr_records_staff_id_idx  on public.hr_records (staff_id);

alter table public.hr_records enable row level security;

grant select, insert, update, delete on table public.hr_records to authenticated;

-- Admin / CEO: full access.
drop policy if exists "hr_records_admin_all" on public.hr_records;
create policy "hr_records_admin_all"
on public.hr_records
for all
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

commit;
