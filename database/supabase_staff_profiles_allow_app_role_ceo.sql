-- =============================================================================
-- staff_profiles: CHECK app_role (ceo) + staff_role (manager, admin, …)
-- =============================================================================
-- Mismo bloque incrustado al inicio de:
--   staff_profiles_seed.sql, supabase_portal_A_staff_profiles.sql,
--   supabase_portal_run_with_demo.sql, supabase_staff_bootstrap.sql,
--   supabase_portal_B_bootstrap.sql
--
-- Errores 23514:
--   staff_profiles_app_role_check → sin 'ceo'
--   staff_profiles_staff_role_check → sin 'manager' / 'admin' / …
-- =============================================================================

-- --- app_role ---
alter table public.staff_profiles drop constraint if exists staff_profiles_app_role_check;
alter table public.staff_profiles drop constraint if exists staff_profiles_app_role_allowed;
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on c.conrelid = t.oid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'staff_profiles'
      and c.contype = 'c'
      and (
        c.conname ilike '%app_role%'
        or pg_catalog.pg_get_constraintdef(c.oid) ilike '%app_role%'
      )
  loop
    execute format('alter table public.staff_profiles drop constraint if exists %I', r.conname);
  end loop;
end $$;
alter table public.staff_profiles
  add constraint staff_profiles_app_role_allowed
  check (app_role in ('admin', 'ceo', 'lead', 'staff'));

-- --- staff_role ---
alter table public.staff_profiles drop constraint if exists staff_profiles_staff_role_check;
alter table public.staff_profiles drop constraint if exists staff_profiles_staff_role_allowed;
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on c.conrelid = t.oid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'staff_profiles'
      and c.contype = 'c'
      and (
        c.conname ilike '%staff_role%'
        or pg_catalog.pg_get_constraintdef(c.oid) ilike '%staff_role%'
      )
  loop
    execute format('alter table public.staff_profiles drop constraint if exists %I', r.conname);
  end loop;
end $$;
alter table public.staff_profiles
  add constraint staff_profiles_staff_role_allowed
  check (
    staff_role is null
    or staff_role in (
      'swimming',
      'fitness',
      'climbing',
      'support',
      'manager',
      'admin'
    )
  );
