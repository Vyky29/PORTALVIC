-- Sync staff portal PINs from portal_login_pins → auth.users (4-digit PINs as password).
-- Exempt: Victor, Raul, Javier (CEO), Sevitha, Michelle, Berta, John, Teflon (no account).
-- Re-run safe: overwrites Auth password for matched staff only.

begin;

create extension if not exists pgcrypto;

with pin_targets as (
  select
    sp.id as user_id,
    sp.username,
    sp.full_name,
    p.pin,
    p.name as pin_name
  from public.portal_login_pins p
  inner join public.staff_profiles sp
    on sp.is_active is distinct from false
   and (
     lower(trim(sp.full_name)) = lower(trim(p.name))
     or (
       lower(trim(p.name)) = 'michelle'
       and lower(trim(sp.username)) = 'michelle'
     )
   )
  where p.portal = 'staff'
    and p.name not in (
      'Berta Trapero Casado',
      'John Kyei-Fram',
      'Michelle',
      'Raul',
      'Sevitha',
      'Javier Arranz Escorial',
      'Teflon',
      'Victor',
      'Admin'
    )
    and p.pin ~ '^\d{4,6}$'
)
update auth.users au
set
  encrypted_password = crypt(pt.pin, gen_salt('bf')),
  updated_at = now()
from pin_targets pt
where au.id = pt.user_id;

-- Row count check (names + whether auth row exists)
select
  p.display_order,
  p.name as pin_name,
  p.pin,
  sp.username,
  sp.full_name,
  au.email,
  case when au.id is not null then 'updated' else 'MISSING AUTH' end as status
from public.portal_login_pins p
left join public.staff_profiles sp
  on sp.is_active is distinct from false
 and (
   lower(trim(sp.full_name)) = lower(trim(p.name))
   or (lower(trim(p.name)) = 'michelle' and lower(trim(sp.username)) = 'michelle')
 )
left join auth.users au on au.id = sp.id
where p.portal = 'staff'
order by p.display_order;

commit;
