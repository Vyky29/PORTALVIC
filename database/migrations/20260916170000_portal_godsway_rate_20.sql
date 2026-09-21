-- Godsway Yatofo: Support Worker Scale 2 £20/h (was Scale 1 £18).
-- Safe to re-run.

begin;

update public.staff_role_rates srr
set role = 'Support Worker',
    scale = 'Scale 2',
    hourly_rate = 20.00,
    is_primary = true,
    updated_at = now()
from public.staff_profiles sp
where srr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) = 'godsway'
    or lower(coalesce(sp.full_name, '')) like 'godsway%'
    or sp.id = 'a010886e-a6cf-485c-ab9d-bbb22abb3439'::uuid
  );

insert into public.staff_role_rates (user_id, role, scale, hourly_rate, is_primary)
select sp.id, 'Support Worker', 'Scale 2', 20.00::numeric, true
from public.staff_profiles sp
where (
    lower(coalesce(sp.username, '')) = 'godsway'
    or lower(coalesce(sp.full_name, '')) like 'godsway%'
    or sp.id = 'a010886e-a6cf-485c-ab9d-bbb22abb3439'::uuid
  )
  and not exists (
    select 1 from public.staff_role_rates x
    where x.user_id = sp.id and x.role = 'Support Worker'
  );

update public.staff_pay_rates spr
set hourly_rate = 20.00,
    role_label = 'Support Worker 2',
    updated_at = now()
from public.staff_profiles sp
where spr.user_id = sp.id
  and (
    lower(coalesce(sp.username, '')) = 'godsway'
    or lower(coalesce(sp.full_name, '')) like 'godsway%'
    or sp.id = 'a010886e-a6cf-485c-ab9d-bbb22abb3439'::uuid
  );

insert into public.staff_pay_rates (user_id, hourly_rate, role_label)
select sp.id, 20.00, 'Support Worker 2'
from public.staff_profiles sp
where (
    lower(coalesce(sp.username, '')) = 'godsway'
    or lower(coalesce(sp.full_name, '')) like 'godsway%'
    or sp.id = 'a010886e-a6cf-485c-ab9d-bbb22abb3439'::uuid
  )
  and not exists (
    select 1 from public.staff_pay_rates x where x.user_id = sp.id
  );

commit;
