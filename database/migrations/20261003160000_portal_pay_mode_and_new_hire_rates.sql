-- New hires on Pay rates, and a place to choose shadowing vs normal pay.
-- Shadowing days pay the flat £13.50. From normal_pay_from the role rate applies.
-- Safe to re-run.

begin;

create table if not exists public.staff_pay_mode (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pay_mode text not null default 'normal' check (pay_mode in ('normal', 'shadowing')),
  normal_pay_from date null,
  updated_at timestamptz not null default now()
);

comment on table public.staff_pay_mode is
  'normal = the role rate every day. shadowing = £13.50 until normal_pay_from (that day included is normal). Empty date keeps every day at £13.50.';

alter table public.staff_pay_mode enable row level security;

grant select, insert, update, delete on table public.staff_pay_mode to authenticated;

drop policy if exists "staff_pay_mode_select_own_admin_ceo" on public.staff_pay_mode;
create policy "staff_pay_mode_select_own_admin_ceo"
on public.staff_pay_mode
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "staff_pay_mode_write_admin_ceo" on public.staff_pay_mode;
create policy "staff_pay_mode_write_admin_ceo"
on public.staff_pay_mode
for all
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

-- John: the new salary is Support Worker £25. Drop the old Service Lead £30 line.
delete from public.staff_role_rates srr
using public.staff_profiles sp
where srr.user_id = sp.id
  and srr.role = 'Service Lead'
  and sp.id = 'fec4f699-739e-48ee-ba0c-604f9887e874'::uuid;

insert into public.staff_role_rates (user_id, role, scale, hourly_rate, is_primary)
select sp.id, v.role, v.scale, v.hourly_rate, true
from public.staff_profiles sp
join (values
  ('ann', 'Support Worker', 'Scale 1', 18.00::numeric),
  ('emmanuel', 'Support Worker', 'Scale 1', 18.00::numeric),
  ('patience', 'Support Worker', 'Scale 1', 18.00::numeric),
  ('daniel', 'Swimming Instructor', 'Scale 1', 22.00::numeric)
) as v(username, role, scale, hourly_rate)
  on lower(sp.username) = v.username
on conflict (user_id, role) do update
set scale = excluded.scale,
    hourly_rate = excluded.hourly_rate,
    is_primary = true,
    updated_at = now();

update public.staff_role_rates srr
set is_primary = false,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and lower(sp.username) in ('ann', 'emmanuel', 'patience', 'daniel')
  and srr.is_primary
  and srr.role not in ('Support Worker', 'Swimming Instructor');

insert into public.staff_pay_rates (user_id, hourly_rate, role_label)
select sp.id, v.hourly_rate, v.role_label
from public.staff_profiles sp
join (values
  ('ann', 18.00::numeric, 'Support Worker 1'),
  ('emmanuel', 18.00::numeric, 'Support Worker 1'),
  ('patience', 18.00::numeric, 'Support Worker 1'),
  ('daniel', 22.00::numeric, 'Swimming Instructor 1')
) as v(username, hourly_rate, role_label)
  on lower(sp.username) = v.username
where not exists (
  select 1 from public.staff_pay_rates x where x.user_id = sp.id
);

update public.staff_pay_rates spr
set hourly_rate = v.hourly_rate,
    role_label = v.role_label,
    updated_at = now()
from public.staff_profiles sp
join (values
  ('ann', 18.00::numeric, 'Support Worker 1'),
  ('emmanuel', 18.00::numeric, 'Support Worker 1'),
  ('patience', 18.00::numeric, 'Support Worker 1'),
  ('daniel', 22.00::numeric, 'Swimming Instructor 1')
) as v(username, hourly_rate, role_label)
  on lower(sp.username) = v.username
where spr.user_id = sp.id;

insert into public.staff_pay_mode (user_id, pay_mode, normal_pay_from)
select sp.id, 'shadowing', null::date
from public.staff_profiles sp
where lower(sp.username) = 'ann'
on conflict (user_id) do update
set pay_mode = 'shadowing',
    normal_pay_from = null,
    updated_at = now();

insert into public.staff_pay_mode (user_id, pay_mode, normal_pay_from)
select sp.id, 'shadowing', date '2026-10-05'
from public.staff_profiles sp
where lower(sp.username) = 'patience'
on conflict (user_id) do update
set pay_mode = 'shadowing',
    normal_pay_from = date '2026-10-05',
    updated_at = now();

insert into public.staff_pay_mode (user_id, pay_mode, normal_pay_from)
select sp.id, 'normal', null::date
from public.staff_profiles sp
where lower(sp.username) in ('emmanuel', 'daniel')
on conflict (user_id) do nothing;

-- Timesheet cost must see Shadowing on the role even when the service name stays.
do $$
declare
  src text;
  nxt text;
  old_line text := 'v_flat := public.portal_service_flat_rate(coalesce(nullif(v_entry->>''service'', ''''), v_role));';
  new_line text := 'v_flat := public.portal_service_flat_rate(coalesce(v_entry->>''service'', '''') || '' '' || coalesce(v_entry->>''role'', ''''));';
begin
  src := pg_get_functiondef('public.staff_timesheets_apply_server_fields()'::regprocedure);
  if position(new_line in src) > 0 then
    return;
  end if;
  if position(old_line in src) = 0 then
    raise exception 'timesheet flat-rate line not found';
  end if;
  nxt := replace(src, old_line, new_line);
  execute nxt;
end $$;

commit;
