-- Youssef: £20/h swimming (Scale 1) and £20/h support worker.

begin;

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
