-- Sevitha (admin): same document/admin RLS as CEOs; CEO dashboard stays UI-blocked only.

begin;

-- portal_profile_staff_key exists from 20260601120000_portal_staff_live_map_admin_select.sql
create or replace function public.portal_staff_profile_is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and coalesce(sp.is_active, true)
      and (
        sp.app_role in ('admin', 'ceo')
        or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
        or public.portal_profile_staff_key(sp.id) in ('sevitha')
      )
  );
$$;

comment on function public.portal_staff_profile_is_portal_admin() is
  'Operations admin dashboard: admin/ceo app_role, manager staff_role, or Sevitha username override.';

create or replace function public.portal_staff_profile_is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and coalesce(sp.is_active, true)
      and (
        sp.app_role in ('admin', 'ceo')
        or public.portal_profile_staff_key(sp.id) in ('sevitha', 'victor', 'javi', 'javier', 'raul')
      )
  );
$$;

comment on function public.portal_staff_profile_is_admin_or_ceo() is
  'Admin/CEO directory reads: app_role admin/ceo or portal username overrides (incl. Sevitha).';

-- Ensure corporate Auth row has admin staff_profiles (id = auth.users.id).
insert into public.staff_profiles (
  id,
  full_name,
  username,
  app_role,
  staff_role,
  dashboard_route,
  is_active
)
select
  au.id,
  'Sevitha',
  'Sevitha',
  'admin',
  'admin',
  'office_portal.html',
  true
from auth.users au
where lower(au.email) in (
  lower('sevitha@clubsensational.org'),
  lower('info@clubsensational.org')
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  username = excluded.username,
  app_role = 'admin',
  staff_role = excluded.staff_role,
  dashboard_route = 'office_portal.html',
  is_active = true;

commit;
