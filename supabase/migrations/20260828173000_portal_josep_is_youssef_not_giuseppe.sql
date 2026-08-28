-- Correction: "Josep" = Youssef (not Giuseppe).
-- Revert Giuseppe SI £24 added by mistake; Youssef already has SW £20 + SI £24.
-- Timesheet: Youssef weekday mornings (incl. midday piscina) pay Support Worker £20.

begin;

delete from public.staff_role_rates srr
using public.staff_profiles sp
where srr.user_id = sp.id
  and srr.role = 'Swimming Instructor'
  and lower(coalesce(sp.username, '')) = 'giuseppe';

update public.staff_role_rates srr
set is_primary = true,
    scale = 'Scale 2',
    hourly_rate = 20.00,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and srr.role = 'Support Worker'
  and lower(coalesce(sp.username, '')) = 'giuseppe';

update public.staff_pay_rates spr
set hourly_rate = 20.00,
    role_label = 'Support Worker 2',
    updated_at = now()
from public.staff_profiles sp
where spr.user_id = sp.id
  and lower(coalesce(sp.username, '')) = 'giuseppe';

-- Youssef: confirm dual rates (morning SW £20 / afternoon SI £24)
update public.staff_role_rates srr
set is_primary = false,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('youssef', 'yousef', 'yusef')
    or lower(coalesce(sp.full_name, '')) like 'youssef%'
  );

insert into public.staff_role_rates (user_id, role, scale, hourly_rate, is_primary)
select sp.id, v.role, v.scale, v.hourly_rate, v.is_primary
from public.staff_profiles sp
cross join (values
  ('Swimming Instructor', 'Scale 2', 24.00::numeric, true),
  ('Support Worker',      'Scale 2', 20.00::numeric, false)
) as v(role, scale, hourly_rate, is_primary)
where lower(coalesce(sp.username, '')) in ('youssef', 'yousef', 'yusef')
   or lower(coalesce(sp.full_name, '')) like 'youssef%'
on conflict (user_id, role) do update
set scale = excluded.scale,
    hourly_rate = excluded.hourly_rate,
    is_primary = excluded.is_primary,
    updated_at = now();

update public.staff_role_rates srr
set is_primary = (srr.role = 'Swimming Instructor'),
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('youssef', 'yousef', 'yusef')
    or lower(coalesce(sp.full_name, '')) like 'youssef%'
  );

update public.staff_pay_rates spr
set hourly_rate = 24.00,
    role_label = 'Swimming Instructor 2',
    updated_at = now()
from public.staff_profiles sp
where spr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('youssef', 'yousef', 'yusef')
    or lower(coalesce(sp.full_name, '')) like 'youssef%'
  );

commit;
