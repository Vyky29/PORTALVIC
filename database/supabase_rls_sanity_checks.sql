-- PORTAL: RLS sanity checks (run after login/bootstrap setup)
-- Purpose: quick visibility into role wiring and policy state.

-- 1) Confirm role mapping in staff_profiles
select
  username,
  app_role,
  staff_role,
  dashboard_route,
  user_id is not null as has_user_link
from public.staff_profiles
order by
  case app_role when 'admin' then 0 when 'ceo' then 1 when 'lead' then 2 else 3 end,
  username;

-- 2) Confirm expected admins + CEOs (Sevitha = admin; Javi, Victor, Raul = ceo)
select username, app_role, staff_role
from public.staff_profiles
where username in ('Javi', 'Victor', 'Raul', 'Sevitha')
order by username;

-- 3) RLS enabled/forced status for key tables
-- Add/remove table names as your schema grows.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('staff_profiles')
order by c.relname;

-- 4) List policies currently defined in public schema
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5) Quick warning report: active profiles missing critical fields
select
  username,
  app_role,
  staff_role,
  dashboard_route,
  user_id
from public.staff_profiles
where is_active = true
  and (
    user_id is null
    or coalesce(app_role, '') = ''
    or coalesce(dashboard_route, '') = ''
  )
order by username;

-- 6) Optional: expected minimal role counts
select app_role, count(*) as people
from public.staff_profiles
where is_active = true
group by app_role
order by app_role;
