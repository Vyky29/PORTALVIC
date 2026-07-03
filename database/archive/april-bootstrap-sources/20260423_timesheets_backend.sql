-- Timesheets backend (rates kept server-side).
-- Front-end submits hours only; pay is calculated in DB from staff_pay_rates.

begin;

create table if not exists public.staff_pay_rates (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  role_label text null,
  updated_at timestamptz not null default now()
);

comment on table public.staff_pay_rates is
  'Private pay rates per staff member (server-side only). Never exposed in front-end.';

create table if not exists public.staff_timesheets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  period_month date not null,
  role_label text not null,
  total_hours numeric(10,2) not null default 0 check (total_hours >= 0),
  entries jsonb not null default '[]'::jsonb,
  hourly_rate_used numeric(10,2) null,
  total_cost numeric(12,2) null,
  expected_hours numeric(10,2) null,
  status text not null default 'submitted',
  submitted_on date not null default current_date,
  constraint staff_timesheets_status_check check (status in ('submitted', 'reviewed', 'approved', 'rejected'))
);

comment on table public.staff_timesheets is
  'Staff monthly timesheets (hours + entries). total_cost calculated in DB from staff_pay_rates.';

create index if not exists staff_timesheets_submitted_by_user_id_idx
  on public.staff_timesheets (submitted_by_user_id);

create index if not exists staff_timesheets_period_month_idx
  on public.staff_timesheets (period_month desc);

create index if not exists staff_timesheets_created_at_idx
  on public.staff_timesheets (created_at desc);

create or replace function public.staff_timesheets_apply_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate numeric(10,2);
begin
  if new.submitted_by_user_id is null then
    new.submitted_by_user_id := auth.uid();
  end if;

  if new.submitted_by_user_id is null then
    raise exception 'Unauthenticated user';
  end if;

  select coalesce(nullif(trim(sp.full_name), ''), nullif(trim(sp.username), ''))
  into new.submitted_by_name
  from public.staff_profiles sp
  where sp.id = new.submitted_by_user_id;

  if coalesce(trim(new.submitted_by_name), '') = '' then
    raise exception 'Missing staff profile display name';
  end if;

  select r.hourly_rate
  into v_rate
  from public.staff_pay_rates r
  where r.user_id = new.submitted_by_user_id;

  new.hourly_rate_used := v_rate;
  if v_rate is not null then
    new.total_cost := round(coalesce(new.total_hours, 0) * v_rate, 2);
  else
    new.total_cost := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_staff_timesheets_apply_server_fields on public.staff_timesheets;
create trigger trg_staff_timesheets_apply_server_fields
before insert or update on public.staff_timesheets
for each row
execute function public.staff_timesheets_apply_server_fields();

alter table public.staff_pay_rates enable row level security;
alter table public.staff_timesheets enable row level security;

grant select on table public.staff_pay_rates to authenticated;
grant insert, select, update on table public.staff_timesheets to authenticated;

drop policy if exists "staff_pay_rates_select_own_admin_ceo" on public.staff_pay_rates;
create policy "staff_pay_rates_select_own_admin_ceo"
on public.staff_pay_rates
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "staff_timesheets_insert_own" on public.staff_timesheets;
create policy "staff_timesheets_insert_own"
on public.staff_timesheets
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
);

drop policy if exists "staff_timesheets_select_own_admin_ceo" on public.staff_timesheets;
create policy "staff_timesheets_select_own_admin_ceo"
on public.staff_timesheets
for select
to authenticated
using (
  submitted_by_user_id = auth.uid()
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "staff_timesheets_update_admin_ceo" on public.staff_timesheets;
create policy "staff_timesheets_update_admin_ceo"
on public.staff_timesheets
for update
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

-- Initial pay-rate seed by known staff names (case-insensitive).
insert into public.staff_pay_rates (user_id, hourly_rate, role_label)
select sp.id, v.hourly_rate, v.role_label
from public.staff_profiles sp
join (
  values
    ('youssef', 22.00::numeric, 'Swimming Instructor 1'),
    ('roberto', 24.00::numeric, 'Swimming Instructor 2'),
    ('aurora', 28.00::numeric, 'Swimming Instructor 3'),
    ('angel', 28.00::numeric, 'Swimming Instructor 3'),
    ('dan', 28.00::numeric, 'Swimming Instructor 3'),
    ('javier', 28.00::numeric, 'Swimming Instructor 3'),
    ('alex', 30.00::numeric, 'Climbing Instructor 3'),
    ('carlos', 30.00::numeric, 'Climbing Instructor 3'),
    ('sandra', 28.00::numeric, 'Fitness Instructor 1'),
    ('godsway', 18.00::numeric, 'Support Worker 1'),
    ('giuseppe', 20.00::numeric, 'Support Worker 2'),
    ('bismark', 23.00::numeric, 'Support Worker 3'),
    ('john', 30.00::numeric, 'Service Lead'),
    ('berta', 30.00::numeric, 'Service Lead')
) as v(staff_name, hourly_rate, role_label)
  on lower(coalesce(sp.username, sp.full_name, '')) = v.staff_name
  or lower(coalesce(sp.full_name, sp.username, '')) = v.staff_name
on conflict (user_id) do update
set hourly_rate = excluded.hourly_rate,
    role_label = excluded.role_label,
    updated_at = now();

commit;

