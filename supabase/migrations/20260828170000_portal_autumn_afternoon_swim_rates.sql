-- Autumn 26/27 afternoon swimming instructor rates + Youssef dual rate.
-- Afternoon SI: Simon £24, Roberto £24, Luliya £22, Youssef £24, Aurora/Dan/Javier £28.
-- Morning Day Centre / support: leave existing SW rows (halftime morning rates TBD).
-- Youssef (Josep): morning (incl. pool) stays Support Worker £20; afternoon swim SI £24
--   (timesheet sessionPayRole enforces morning → SW so piscina no longer bumps to £24).

begin;

-- ========== SIMON: SI Scale 1 £22 → Scale 2 £24 ==========
update public.staff_role_rates srr
set scale = 'Scale 2',
    hourly_rate = 24.00,
    is_primary = true,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and srr.role = 'Swimming Instructor'
  and (
    lower(coalesce(sp.username, '')) = 'simon'
    or lower(coalesce(sp.full_name, '')) like 'simon%'
  );

insert into public.staff_role_rates (user_id, role, scale, hourly_rate, is_primary)
select sp.id, 'Swimming Instructor', 'Scale 2', 24.00::numeric, true
from public.staff_profiles sp
where (
    lower(coalesce(sp.username, '')) = 'simon'
    or lower(coalesce(sp.full_name, '')) like 'simon%'
  )
  and not exists (
    select 1 from public.staff_role_rates x
    where x.user_id = sp.id and x.role = 'Swimming Instructor'
  );

insert into public.staff_pay_rates (user_id, hourly_rate, role_label)
select sp.id, 24.00::numeric, 'Swimming Instructor 2'
from public.staff_profiles sp
where lower(coalesce(sp.username, '')) = 'simon'
   or lower(coalesce(sp.full_name, '')) like 'simon%'
on conflict (user_id) do update
set hourly_rate = excluded.hourly_rate,
    role_label = excluded.role_label,
    updated_at = now();

-- ========== ROBERTO: confirm SI £24 (afternoons); keep SW £20 ==========
update public.staff_role_rates srr
set scale = 'Scale 2',
    hourly_rate = 24.00,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and srr.role = 'Swimming Instructor'
  and lower(coalesce(sp.username, '')) = 'roberto';

update public.staff_pay_rates spr
set hourly_rate = 24.00,
    role_label = 'Swimming Instructor 2',
    updated_at = now()
from public.staff_profiles sp
where spr.user_id = sp.id
  and lower(coalesce(sp.username, '')) = 'roberto';

-- ========== LULIYA: confirm SI £22 afternoons; SW £18 morning (TBD / leave) ==========
update public.staff_role_rates srr
set scale = 'Scale 1',
    hourly_rate = 22.00,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and srr.role = 'Swimming Instructor'
  and (
    lower(coalesce(sp.username, '')) in ('luliya', 'lulia', 'aida')
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) in ('luliya', 'lulia', 'aida')
  );

-- ========== YOUSSEF (Josep): SW £20 + SI £24 afternoon swim ==========
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

-- ========== AURORA / DAN / JAVIER: confirm SI Scale 3 £28 ==========
update public.staff_role_rates srr
set scale = 'Scale 3',
    hourly_rate = 28.00,
    is_primary = true,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and srr.role = 'Swimming Instructor'
  and lower(coalesce(sp.username, '')) in ('aurora', 'dan', 'javier');

update public.staff_pay_rates spr
set hourly_rate = 28.00,
    role_label = 'Swimming Instructor 3',
    updated_at = now()
from public.staff_profiles sp
where spr.user_id = sp.id
  and lower(coalesce(sp.username, '')) in ('aurora', 'dan', 'javier');

commit;
