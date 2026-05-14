-- =============================================================================
-- PORTAL + Demo (stf020) — Supabase SQL Editor
-- =============================================================================
--
-- ⚠️ ERROR "EXPLAIN only works on a single SQL statement"
--    En Supabase: NO uses el botón / atajo **Explain** con varias sentencias a la vez.
--    Usa **Run** (ejecutar). Si quieres Explain, selecciona UNA sola consulta.
--
-- Opción fácil: los scripts A/B del repo ya incluyen el fix CHECK al inicio (varias
-- sentencias por archivo → Run en todo el archivo). Alternativa: por bloques,
--   database/supabase_portal_C_test_passwords.sql
--   database/supabase_portal_D_diagnostic.sql
--
-- Orden: crear usuario stf020@… en Authentication → luego A → B → C → D (opcional).
-- Este archivo incluye fix CHECK app_role + staff_role + varios bloques: Run en TODO
-- el archivo (no Explain). Mismo bloque que database/supabase_staff_profiles_allow_app_role_ceo.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- [Incluido] CHECK app_role + staff_role (antes de BLOQUE A)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- BLOQUE A — staff_profiles (sin BEGIN/COMMIT = una sentencia con CTE)
-- -----------------------------------------------------------------------------

with map(username, full_name, auth_email, app_role, staff_role, dashboard_route, is_active) as (
  values
    ('Sandra','Sandra','stf001@staff.import.pending','staff','fitness','/p1/',true),
    ('Roberto','Roberto','stf002@staff.import.pending','staff','swimming','/p1/',true),
    ('Dan','Dan','stf003@staff.import.pending','staff','swimming','/p1/',true),
    ('Angel','Angel','stf004@staff.import.pending','staff','swimming','/p1/',true),
    ('Youssef','Youssef Moustafa','stf005@staff.import.pending','staff','swimming','/p1/',true),
    ('John','John','stf006@staff.import.pending','lead','support','/l1/',true),
    ('Bismark','Bismark','stf007@staff.import.pending','staff','support','/p1/',true),
    ('Giuseppe','Giuseppe','stf008@staff.import.pending','staff','support','/p1/',true),
    ('Godsway','Godsway','stf009@staff.import.pending','staff','support','/p1/',true),
    ('Javier','Javier','stf010@staff.import.pending','staff','swimming','/p1/',true),
    ('Aurora','Aurora','stf011@staff.import.pending','staff','swimming','/p1/',true),
    ('Berta','Berta','stf012@staff.import.pending','lead','support','/l1/',true),
    ('Victor','Victor','stf013@staff.import.pending','ceo','manager','/ce/',true),
    ('Carlos','Carlos','stf014@staff.import.pending','staff','climbing','/p1/',true),
    ('Alex','Alex','stf015@staff.import.pending','staff','climbing','/p1/',true),
    ('Javi','Javi','stf017@staff.import.pending','ceo','manager','/ce/',true),
    ('Raul','Raul','stf018@staff.import.pending','ceo','manager','/ce/',true),
    ('Sevitha','Sevitha','stf019@staff.import.pending','admin','admin','/operations-admin/',true),
    ('demo','Demo','stf020@staff.import.pending','staff','swimming','/p1/',true)
),
auth_map as (
  select m.*, au.id as auth_user_id
  from map m
  join auth.users au on lower(au.email) = lower(m.auth_email)
)
insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select
  auth_user_id,
  full_name,
  username,
  app_role,
  staff_role,
  dashboard_route,
  is_active
from auth_map
on conflict (id) do update
set
  full_name = excluded.full_name,
  username = excluded.username,
  app_role = excluded.app_role,
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route,
  is_active = excluded.is_active;

-- -----------------------------------------------------------------------------
-- BLOQUE B — bootstrap rutas / roles (una sentencia)
-- -----------------------------------------------------------------------------

with map(username, auth_email, dashboard_route, app_role, staff_role) as (
  values
    ('Sandra','stf001@staff.import.pending','/p1/','staff','fitness'),
    ('Roberto','stf002@staff.import.pending','/p1/','staff','swimming'),
    ('Dan','stf003@staff.import.pending','/p1/','staff','swimming'),
    ('Angel','stf004@staff.import.pending','/p1/','staff','swimming'),
    ('Youssef','stf005@staff.import.pending','/p1/','staff','swimming'),
    ('John','stf006@staff.import.pending','/l1/','lead','support'),
    ('Bismark','stf007@staff.import.pending','/p1/','staff','support'),
    ('Giuseppe','stf008@staff.import.pending','/p1/','staff','support'),
    ('Godsway','stf009@staff.import.pending','/p1/','staff','support'),
    ('Javier','stf010@staff.import.pending','/p1/','staff','swimming'),
    ('Aurora','stf011@staff.import.pending','/p1/','staff','swimming'),
    ('Berta','stf012@staff.import.pending','/l1/','lead','support'),
    ('Victor','stf013@staff.import.pending','/ce/','ceo','manager'),
    ('Carlos','stf014@staff.import.pending','/p1/','staff','climbing'),
    ('Alex','stf015@staff.import.pending','/p1/','staff','climbing'),
    ('Javi','stf017@staff.import.pending','/ce/','ceo','manager'),
    ('Raul','stf018@staff.import.pending','/ce/','ceo','manager'),
    ('Sevitha','stf019@staff.import.pending','/operations-admin/','admin','admin'),
    ('demo','stf020@staff.import.pending','/p1/','staff','swimming')
)
update public.staff_profiles sp
set
  dashboard_route = coalesce(nullif(sp.dashboard_route, ''), m.dashboard_route),
  app_role = coalesce(nullif(sp.app_role, ''), m.app_role),
  staff_role = coalesce(nullif(sp.staff_role, ''), m.staff_role)
from map m
left join auth.users au on lower(au.email) = lower(m.auth_email)
where sp.id = au.id;

-- -----------------------------------------------------------------------------
-- BLOQUE C — contraseña de prueba 990099 (una sentencia; mín. 6 en Auth email)
-- -----------------------------------------------------------------------------

update auth.users
set
  encrypted_password = crypt('990099', gen_salt('bf')),
  updated_at = now()
where email in (
  'stf001@staff.import.pending',
  'stf002@staff.import.pending',
  'stf003@staff.import.pending',
  'stf004@staff.import.pending',
  'stf005@staff.import.pending',
  'stf006@staff.import.pending',
  'stf007@staff.import.pending',
  'stf008@staff.import.pending',
  'stf009@staff.import.pending',
  'stf010@staff.import.pending',
  'stf011@staff.import.pending',
  'stf012@staff.import.pending',
  'stf013@staff.import.pending',
  'stf014@staff.import.pending',
  'stf015@staff.import.pending',
  'stf017@staff.import.pending',
  'stf018@staff.import.pending',
  'stf019@staff.import.pending',
  'stf020@staff.import.pending'
);

-- -----------------------------------------------------------------------------
-- BLOQUE D — diagnóstico (una sentencia)
-- -----------------------------------------------------------------------------

select x.email as missing_auth_user
from (
  values
    ('stf001@staff.import.pending'),
    ('stf002@staff.import.pending'),
    ('stf003@staff.import.pending'),
    ('stf004@staff.import.pending'),
    ('stf005@staff.import.pending'),
    ('stf006@staff.import.pending'),
    ('stf007@staff.import.pending'),
    ('stf008@staff.import.pending'),
    ('stf009@staff.import.pending'),
    ('stf010@staff.import.pending'),
    ('stf011@staff.import.pending'),
    ('stf012@staff.import.pending'),
    ('stf013@staff.import.pending'),
    ('stf014@staff.import.pending'),
    ('stf015@staff.import.pending'),
    ('stf017@staff.import.pending'),
    ('stf018@staff.import.pending'),
    ('stf019@staff.import.pending'),
    ('stf020@staff.import.pending')
) as x(email)
where not exists (
  select 1 from auth.users au where lower(au.email) = lower(x.email)
)
order by 1;
