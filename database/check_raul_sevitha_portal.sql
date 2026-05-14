-- =============================================================================
-- Portal: comprobar Raúl (stf018) y Sevitha (stf019) — Supabase SQL Editor
--
-- IMPORTANTE: si pegas TODO el archivo de una vez, el editor suele ejecutar solo
-- la ÚLTIMA sentencia (los INSERT). Eso puede dar "Success" sin filas visibles.
-- Para diagnóstico, ejecuta SOLO el bloque "0) Resumen" o cada SELECT aparte.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Resumen — SIEMPRE devuelve 2 filas (fácil de leer en el resultado)
--     auth_ok = fila en auth.users | profile_ok = fila staff_profiles con mismo id
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

-- -----------------------------------------------------------------------------
-- 1) ¿Existen en Authentication? (id = el que debe tener staff_profiles.id)
-- -----------------------------------------------------------------------------
select
  au.id,
  au.email,
  au.email_confirmed_at is not null as email_confirmed,
  au.created_at
from auth.users au
where lower(au.email) in (
  lower('stf018@staff.import.pending'),
  lower('stf019@staff.import.pending')
)
order by au.email;

-- -----------------------------------------------------------------------------
-- 2) ¿Tienen fila en staff_profiles y coincide id con auth?
-- -----------------------------------------------------------------------------
select
  sp.id,
  sp.username,
  sp.full_name,
  sp.app_role,
  sp.staff_role,
  sp.dashboard_route,
  sp.is_active,
  au.email as auth_email
from public.staff_profiles sp
join auth.users au on au.id = sp.id
where lower(au.email) in (
  lower('stf018@staff.import.pending'),
  lower('stf019@staff.import.pending')
)
order by au.email;

-- -----------------------------------------------------------------------------
-- 3) Auth sí, perfil no (debería devolver 0 filas si todo está enlazado)
-- -----------------------------------------------------------------------------
select au.email as auth_without_profile
from auth.users au
left join public.staff_profiles sp on sp.id = au.id
where lower(au.email) in (
  lower('stf018@staff.import.pending'),
  lower('stf019@staff.import.pending')
)
  and sp.id is null;

-- -----------------------------------------------------------------------------
-- 4) Perfil sí, usuario Auth no (anómalo)
-- -----------------------------------------------------------------------------
select sp.id, sp.username, sp.app_role
from public.staff_profiles sp
left join auth.users au on au.id = sp.id
where (sp.username in ('Raul', 'Sevitha') or sp.full_name in ('Raul', 'Sevitha'))
  and au.id is null;

-- =============================================================================
-- OPCIONAL: crear / actualizar staff_profiles solo si YA existe auth.users
-- (si inserta 0 filas, falta crear el usuario en Authentication primero)
-- =============================================================================

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

-- Contraseña de prueba compartida (solo si usáis el flujo stf* + crypt en vuestro proyecto):
-- Ver database/supabase_update_test_passwords.sql (incluye stf018 y stf019).
