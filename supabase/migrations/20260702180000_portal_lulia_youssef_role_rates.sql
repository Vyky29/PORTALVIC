-- Luliya (lulia) + Youssef: dual Support Worker / Swimming Instructor pay rates for timesheets.
-- Clear is_primary before upsert to avoid staff_role_rates_one_primary_per_user violation.

begin;

-- ========== LULIYA ==========
update public.staff_role_rates srr
set is_primary = false,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('luliya', 'lulia', 'aida')
    or lower(coalesce(sp.full_name, '')) in ('luliya', 'lulia', 'aida lulia')
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) in ('luliya', 'lulia', 'aida')
  );

insert into public.staff_role_rates (user_id, role, scale, hourly_rate, is_primary)
select sp.id, v.role, v.scale, v.hourly_rate, v.is_primary
from public.staff_profiles sp
cross join (values
  ('Support Worker',      'Scale 1', 18.00::numeric, true),
  ('Swimming Instructor', 'Scale 1', 22.00::numeric, false)
) as v(role, scale, hourly_rate, is_primary)
where lower(coalesce(sp.username, '')) in ('luliya', 'lulia', 'aida')
   or lower(coalesce(sp.full_name, '')) in ('luliya', 'lulia', 'aida lulia')
   or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) in ('luliya', 'lulia', 'aida')
on conflict (user_id, role) do update
set scale = excluded.scale,
    hourly_rate = excluded.hourly_rate,
    is_primary = excluded.is_primary,
    updated_at = now();

update public.staff_role_rates srr
set is_primary = (srr.role = 'Support Worker'),
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('luliya', 'lulia', 'aida')
    or lower(coalesce(sp.full_name, '')) in ('luliya', 'lulia', 'aida lulia')
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) in ('luliya', 'lulia', 'aida')
  );

update public.staff_pay_rates spr
set hourly_rate = 18.00,
    role_label = 'Support Worker 1',
    updated_at = now()
from public.staff_profiles sp
where spr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('luliya', 'lulia', 'aida')
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) in ('luliya', 'lulia', 'aida')
  );

-- ========== YOUSSEF ==========
update public.staff_role_rates srr
set is_primary = false,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('youssef', 'yousef', 'yusef')
    or lower(coalesce(sp.full_name, '')) like 'youssef%'
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) in ('youssef', 'yousef', 'yusef')
  );

insert into public.staff_role_rates (user_id, role, scale, hourly_rate, is_primary)
select sp.id, v.role, v.scale, v.hourly_rate, v.is_primary
from public.staff_profiles sp
cross join (values
  ('Swimming Instructor', 'Scale 1', 20.00::numeric, true),
  ('Support Worker',      'Scale 1', 20.00::numeric, false)
) as v(role, scale, hourly_rate, is_primary)
where lower(coalesce(sp.username, '')) in ('youssef', 'yousef', 'yusef')
   or lower(coalesce(sp.full_name, '')) like 'youssef%'
   or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) in ('youssef', 'yousef', 'yusef')
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
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) in ('youssef', 'yousef', 'yusef')
  );

update public.staff_pay_rates spr
set hourly_rate = 20.00,
    role_label = 'Swimming Instructor 1',
    updated_at = now()
from public.staff_profiles sp
where spr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('youssef', 'yousef', 'yusef')
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) in ('youssef', 'yousef', 'yusef')
  );

commit;
