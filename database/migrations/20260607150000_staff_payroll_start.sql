-- Payroll start month per worker. The monthly payroll report uses this to avoid
-- listing someone as "not submitted" (and applying the £5 penalty) for months
-- BEFORE they started working. New hires / returners only become "expected"
-- from their start_month onwards.

begin;

create table if not exists public.staff_payroll_start (
  user_id uuid primary key references auth.users (id) on delete cascade,
  start_month date not null,
  note text null,
  updated_at timestamptz not null default now()
);

comment on table public.staff_payroll_start is
  'First payroll month a worker is expected to submit. Report ignores earlier months for them (no penalty).';

alter table public.staff_payroll_start enable row level security;
grant select, insert, update, delete on table public.staff_payroll_start to authenticated;

drop policy if exists "staff_payroll_start_select_admin_ceo" on public.staff_payroll_start;
create policy "staff_payroll_start_select_admin_ceo" on public.staff_payroll_start
for select to authenticated using (
  exists (select 1 from public.staff_profiles sp where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo'))
);

drop policy if exists "staff_payroll_start_write_admin_ceo" on public.staff_payroll_start;
create policy "staff_payroll_start_write_admin_ceo" on public.staff_payroll_start
for all to authenticated using (
  exists (select 1 from public.staff_profiles sp where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo'))
) with check (
  exists (select 1 from public.staff_profiles sp where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo'))
);

-- Seed known start/return months for 2026.
insert into public.staff_payroll_start (user_id, start_month, note)
select sp.id, v.start_month::date, v.name
from (values
  ('godsway',  'Godsway Yatofo',   '2026-02-01'),
  ('youssef',  'Youssef Moustafa', '2026-04-01'),
  ('simon',    'Simon Griffiths',  '2026-05-01'),
  ('luliya',   'Luliya',           '2026-05-01'),
  ('michelle', 'Michelle',         '2026-05-01'),
  ('andres',   'Andres Borrego',   '2026-06-01')
) as v(key, name, start_month)
join public.staff_profiles sp
  on lower(sp.username) = v.key or lower(sp.full_name) = lower(v.name)
on conflict (user_id) do update set start_month = excluded.start_month, note = excluded.note;

commit;
