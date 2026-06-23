-- Bismark: Support Worker Scale 3 @ £23/h (primary), Climbing Instructor Scale 3 @ £30/h.
-- Align legacy staff_pay_rates row (was showing £24/h in timesheet header).

begin;

update public.staff_pay_rates spr
set hourly_rate = 23.00,
    role_label = 'Support Worker 3',
    updated_at = now()
from public.staff_profiles sp
where spr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) = 'bismark'
    or lower(coalesce(sp.full_name, '')) = 'bismark'
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) = 'bismark'
  );

insert into public.staff_role_rates (user_id, role, scale, hourly_rate, is_primary)
select sp.id, v.role, v.scale, v.hourly_rate, v.is_primary
from public.staff_profiles sp
cross join (values
  ('Support Worker',      'Scale 3', 23.00::numeric, true),
  ('Climbing Instructor', 'Scale 3', 30.00::numeric, false)
) as v(role, scale, hourly_rate, is_primary)
where lower(coalesce(sp.username, '')) = 'bismark'
   or lower(coalesce(sp.full_name, '')) = 'bismark'
   or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) = 'bismark'
on conflict (user_id, role) do update
set scale = excluded.scale,
    hourly_rate = excluded.hourly_rate,
    is_primary = excluded.is_primary,
    updated_at = now();

-- Ensure only Support Worker is marked primary when both roles exist.
update public.staff_role_rates srr
set is_primary = (srr.role = 'Support Worker'),
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) = 'bismark'
    or lower(coalesce(sp.full_name, '')) = 'bismark'
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) = 'bismark'
  );

commit;
