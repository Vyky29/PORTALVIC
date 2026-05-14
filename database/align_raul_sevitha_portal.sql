-- =============================================================================
-- Alinear Raúl (stf018) + Sevitha (stf019): mismo login que el resto (contraseña de prueba 990099; Supabase mín. 6)
--
-- Si al ejecutar algo ves aviso de "New table … without RLS": CANCELAR.
-- Ese aviso es para CREATE TABLE; este archivo NO crea tablas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Resumen (ejecutar solo este SELECT primero)
--     auth_ok / profile_ok deben pasar a true tras los pasos B y D
-- -----------------------------------------------------------------------------
select
  e.expected_email,
  e.label,
  exists (
    select 1 from auth.users au where lower(au.email) = lower(e.expected_email)
  ) as auth_ok,
  exists (
    select 1
    from auth.users au
    join public.staff_profiles sp on sp.id = au.id
    where lower(au.email) = lower(e.expected_email)
  ) as profile_ok
from (
  values
    ('stf018@staff.import.pending', 'Raul'),
    ('stf019@staff.import.pending', 'Sevitha')
) as e(expected_email, label)
order by e.expected_email;

-- =============================================================================
-- PASO 1 (fuera de SQL): crear usuarios en Auth + contraseña 990099
--
-- Desde la carpeta del repo (PowerShell), con service_role del proyecto:
--
--   $env:SUPABASE_URL="https://TU_REF.supabase.co"
--   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."
--   $env:PORTAL_STAFF_BOOTSTRAP_PASSWORD="990099"
--   $env:PORTAL_STAFF_ONLY_EMAIL="stf018@staff.import.pending,stf019@staff.import.pending"
--   python database\provision_staff_auth_users.py
--
-- Authentication → Providers → Email: longitud mínima ≤ 6 (la contraseña por defecto es 990099).
-- Alternativa: crear ambos usuarios en el panel y luego ejecutar el bloque C abajo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- B) staff_profiles (ejecutar SOLO después de auth_ok = true en A)
-- -----------------------------------------------------------------------------
insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Raul', 'Raul', 'ceo', 'manager', '/ce/', true
from auth.users au
where lower(au.email) = lower('stf018@staff.import.pending')
on conflict (id) do update
set
  full_name = excluded.full_name,
  username = excluded.username,
  app_role = excluded.app_role,
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route,
  is_active = excluded.is_active;

insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Sevitha', 'Sevitha', 'admin', 'admin', '/operations-admin/', true
from auth.users au
where lower(au.email) = lower('stf019@staff.import.pending')
on conflict (id) do update
set
  full_name = excluded.full_name,
  username = excluded.username,
  app_role = excluded.app_role,
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route,
  is_active = excluded.is_active;

-- -----------------------------------------------------------------------------
-- C) Opcional: forzar contraseña 990099 solo en estos dos (si ya existen en Auth)
--     Igual que database/supabase_update_test_passwords.sql (pgcrypto).
--     Database → Extensions: activa "pgcrypto" si crypt() no existe.
--     Si "UPDATE 0": los usuarios Auth no existen — haz PASO 1 primero.
-- -----------------------------------------------------------------------------
update auth.users
set
  encrypted_password = crypt('990099', gen_salt('bf')),
  updated_at = now()
where lower(email) in (
  lower('stf018@staff.import.pending'),
  lower('stf019@staff.import.pending')
);

-- -----------------------------------------------------------------------------
-- D) Vuelve a ejecutar el SELECT del bloque A → ambos profile_ok = true
-- -----------------------------------------------------------------------------
-- Login web: nombre "Raul" o "Sevitha" + contraseña 990099 (auth-map ya los mapea).
