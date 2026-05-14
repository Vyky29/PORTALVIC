-- =============================================================================
-- Alinear Javi (CEO) — mismo patrón que align_raul_sevitha_portal.sql
--
-- En el repo / login, el nombre "Javi" mapea a: stf017@staff.import.pending
-- (ver auth-map.js). El id en staff_profiles DEBE ser el mismo UUID que auth.users.id.
--
-- Si creaste el usuario en Auth con OTRO email, o bien:
--   - cambias el email en Authentication → Users al placeholder, o
--   - sustituye abajo 'stf017@staff.import.pending' por el email exacto que usaste
--     en los WHERE (y opcionalmente ajusta username/full_name).
--
-- Contraseña: si el panel solo acepta ≥6 caracteres, usa 990099 o la que tengáis unificada;
-- el bloque C pone 990099 en el placeholder stf017.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Resumen
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
from (values ('stf017@staff.import.pending', 'Javi')) as e(expected_email, label);

-- -----------------------------------------------------------------------------
-- (Opcional) Ver qué hay en Auth si no estás seguro del email
-- -----------------------------------------------------------------------------
-- select id, email, created_at from auth.users
-- where lower(email) like '%javi%' or lower(email) like '%stf017%'
-- order by created_at desc;

-- -----------------------------------------------------------------------------
-- B) staff_profiles — ejecutar solo si auth_ok = true en A
-- -----------------------------------------------------------------------------
insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Javi', 'Javi', 'ceo', 'manager', '/ce/', true
from auth.users au
where lower(au.email) = lower('stf017@staff.import.pending')
on conflict (id) do update
set
  full_name = excluded.full_name,
  username = excluded.username,
  app_role = excluded.app_role,
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route,
  is_active = excluded.is_active;

-- -----------------------------------------------------------------------------
-- C) Opcional: misma contraseña de prueba que el resto (990099) en stf017
-- -----------------------------------------------------------------------------
update auth.users
set
  encrypted_password = crypt('990099', gen_salt('bf')),
  updated_at = now()
where lower(email) = lower('stf017@staff.import.pending');

-- -----------------------------------------------------------------------------
-- D) Vuelve a ejecutar el bloque A → profile_ok = true; luego login "Javi" + esa clave
-- =============================================================================
