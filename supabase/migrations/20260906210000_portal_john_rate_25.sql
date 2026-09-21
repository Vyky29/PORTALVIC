-- John Kyei-Fram: £25/h Support Worker (primary) from Autumn — was Service Lead £30.
-- Safe to re-run.

begin;

update public.staff_role_rates srr
set is_primary = false,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('john', 'johnny')
    or lower(coalesce(sp.full_name, '')) like 'john%'
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) = 'john'
    or sp.id = 'fec4f699-739e-48ee-ba0c-604f9887e874'::uuid
  );

insert into public.staff_role_rates (user_id, role, scale, hourly_rate, is_primary)
select sp.id, v.role, v.scale, v.hourly_rate, v.is_primary
from public.staff_profiles sp
cross join (values
  ('Support Worker', 'Scale 2', 25.00::numeric, true)
) as v(role, scale, hourly_rate, is_primary)
where (
    lower(coalesce(sp.username, '')) in ('john', 'johnny')
    or lower(coalesce(sp.full_name, '')) like 'john%'
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) = 'john'
    or sp.id = 'fec4f699-739e-48ee-ba0c-604f9887e874'::uuid
  )
on conflict (user_id, role) do update
set scale = excluded.scale,
    hourly_rate = excluded.hourly_rate,
    is_primary = excluded.is_primary,
    updated_at = now();

update public.staff_role_rates srr
set is_primary = (srr.role = 'Support Worker'),
    hourly_rate = case when srr.role = 'Support Worker' then 25.00 else srr.hourly_rate end,
    scale = case when srr.role = 'Support Worker' then 'Scale 2' else srr.scale end,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('john', 'johnny')
    or lower(coalesce(sp.full_name, '')) like 'john%'
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) = 'john'
    or sp.id = 'fec4f699-739e-48ee-ba0c-604f9887e874'::uuid
  );

/* Demote legacy Service Lead / Lead rows so they are not primary. */
update public.staff_role_rates srr
set is_primary = false,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('john', 'johnny')
    or lower(coalesce(sp.full_name, '')) like 'john%'
    or sp.id = 'fec4f699-739e-48ee-ba0c-604f9887e874'::uuid
  )
  and lower(coalesce(srr.role, '')) in ('service lead', 'lead', 'specialist support worker — session lead');

update public.staff_pay_rates spr
set hourly_rate = 25.00,
    role_label = 'Support Worker 2',
    updated_at = now()
from public.staff_profiles sp
where spr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) in ('john', 'johnny')
    or lower(coalesce(sp.full_name, '')) like 'john%'
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) = 'john'
    or sp.id = 'fec4f699-739e-48ee-ba0c-604f9887e874'::uuid
  );

insert into public.staff_pay_rates (user_id, hourly_rate, role_label)
select sp.id, 25.00, 'Support Worker 2'
from public.staff_profiles sp
where (
    lower(coalesce(sp.username, '')) in ('john', 'johnny')
    or lower(coalesce(sp.full_name, '')) like 'john%'
    or lower(split_part(coalesce(sp.full_name, ''), ' ', 1)) = 'john'
    or sp.id = 'fec4f699-739e-48ee-ba0c-604f9887e874'::uuid
  )
  and not exists (
    select 1 from public.staff_pay_rates x where x.user_id = sp.id
  );

commit;
