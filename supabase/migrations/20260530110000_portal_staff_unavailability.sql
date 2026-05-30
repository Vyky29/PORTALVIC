-- Staff days off / unavailability.
-- One row per (person, date) the person is NOT working. Managed from the
-- Staff & HR person screen; merged into scheduling/availability views later.
-- People are keyed by the HR roster key (name_key) so it lines up with
-- Staff & HR; staff_id/staff_name are kept for reference and self-view.
--
-- Contains staff names => RLS locks writes to admin / CEO. A person can read
-- their own days off (staff_id = auth.uid()).

begin;

create table if not exists public.staff_unavailability (
  id          uuid primary key default gen_random_uuid(),
  name_key    text not null,                 -- HR roster key (matches hr_records.name_key)
  staff_name  text,                          -- display name captured at write time
  staff_id    uuid,                          -- staff_profiles.id when linked
  off_date    date not null,
  reason      text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  constraint staff_unavailability_unique unique (name_key, off_date)
);

comment on table public.staff_unavailability is
  'Days a staff member is not working (days off / unavailability). Admin/CEO manage; person can read own.';

create index if not exists staff_unavailability_date_idx     on public.staff_unavailability (off_date);
create index if not exists staff_unavailability_namekey_idx  on public.staff_unavailability (name_key);
create index if not exists staff_unavailability_staffid_idx  on public.staff_unavailability (staff_id);

alter table public.staff_unavailability enable row level security;

grant select, insert, update, delete on table public.staff_unavailability to authenticated;

-- Admin / CEO: full control.
drop policy if exists "staff_unavailability_admin_all" on public.staff_unavailability;
create policy "staff_unavailability_admin_all"
on public.staff_unavailability
for all
to authenticated
using (
  exists (select 1 from public.staff_profiles sp where sp.id = auth.uid() and sp.app_role in ('admin','ceo'))
)
with check (
  exists (select 1 from public.staff_profiles sp where sp.id = auth.uid() and sp.app_role in ('admin','ceo'))
);

-- A person can see their own days off.
drop policy if exists "staff_unavailability_self_read" on public.staff_unavailability;
create policy "staff_unavailability_self_read"
on public.staff_unavailability
for select
to authenticated
using (staff_id is not null and staff_id = auth.uid());

-- Seed: Michelle is not working on 10 and 24 June 2026.
with mich as (
  select
    coalesce(
      (select hr.name_key from public.hr_records hr
         where hr.employee_name ilike 'michelle%' and hr.name_key is not null
         order by hr.row_index limit 1),
      (select public.hr_name_key(sp.full_name) from public.staff_profiles sp
         where lower(sp.username) = 'michelle' or lower(trim(sp.full_name)) like 'michelle%'
         limit 1),
      'michelle'
    ) as name_key,
    coalesce(
      (select hr.employee_name from public.hr_records hr
         where hr.employee_name ilike 'michelle%' order by hr.row_index limit 1),
      (select sp.full_name from public.staff_profiles sp
         where lower(sp.username) = 'michelle' or lower(trim(sp.full_name)) like 'michelle%'
         limit 1),
      'Michelle'
    ) as staff_name,
    (select sp.id from public.staff_profiles sp
       where lower(sp.username) = 'michelle' or lower(trim(sp.full_name)) like 'michelle%'
       limit 1) as staff_id
)
insert into public.staff_unavailability (name_key, staff_name, staff_id, off_date, reason)
select m.name_key, m.staff_name, m.staff_id, d.off_date, 'Not working'
from mich m
cross join (values ('2026-06-10'::date), ('2026-06-24'::date)) as d(off_date)
on conflict (name_key, off_date) do nothing;

commit;

-- Check:
-- select * from public.staff_unavailability order by off_date;
