-- Youssef: £24/h swimming (primary), £20/h support (was £22 swim).

begin;

update public.staff_role_rates srr
set hourly_rate = 24.00,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and srr.role = 'Swimming Instructor'
  and (
    lower(coalesce(sp.username, '')) in ('youssef', 'yousef', 'yusef')
    or lower(coalesce(sp.full_name, '')) like 'youssef%'
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) in ('youssef', 'yousef', 'yusef')
  );

update public.staff_pay_rates spr
set hourly_rate = 24.00,
    role_label = 'Swimming Instructor 1',
    updated_at = now()
from public.staff_profiles sp
where spr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('youssef', 'yousef', 'yusef')
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) in ('youssef', 'yousef', 'yusef')
  );

commit;
