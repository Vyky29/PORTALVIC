-- Portal (cklpnwhlqsulpmkipmqb) — recrear Sevitha / info@ (ver también 20260618120000_portal_five_corporate_emails.sql)
--
-- Modelo actual: Auth = sevitha@clubsensational.org; info@ es alias de login en el navegador.
--
-- El mensaje "email already in use" casi siempre es auth.users (o auth.identities), NO el HTML del portal.
-- staff_profiles no guarda el login email; el enlace es staff_profiles.id = auth.users.id.
--
-- Orden: 1 diagnóstico → 2 limpieza (solo si hace falta) → 3 crear usuario en Dashboard → 4 enlazar perfil

-- =============================================================================
-- 1) ¿Quién tiene ese email (o alias Sevitha)?
-- =============================================================================
select 'auth.users' as src, au.id, au.email, au.created_at, au.deleted_at
from auth.users au
where lower(au.email) in (
  lower('info@clubsensational.org'),
  lower('sevitha@clubsensational.org'),
  lower('sevitha802@gmail.com'),
  lower('stf019@staff.import.pending')
)
order by au.email;

select 'auth.identities' as src, i.id, i.user_id, i.provider, i.identity_data->>'email' as identity_email
from auth.identities i
where lower(coalesce(i.identity_data->>'email', '')) in (
  lower('info@clubsensational.org'),
  lower('sevitha@clubsensational.org'),
  lower('sevitha802@gmail.com'),
  lower('stf019@staff.import.pending')
);

select 'staff_profiles' as src, sp.id, sp.username, sp.full_name, sp.app_role, au.email as linked_auth_email
from public.staff_profiles sp
left join auth.users au on au.id = sp.id
where lower(coalesce(sp.username, '')) in ('sevitha', 'stf019')
   or lower(trim(coalesce(sp.full_name, ''))) = 'sevitha'
   or lower(coalesce(au.email, '')) in (
     lower('info@clubsensational.org'),
     lower('sevitha@clubsensational.org'),
     lower('sevitha802@gmail.com'),
     lower('stf019@staff.import.pending')
   );

-- Perfiles Sevitha SIN usuario Auth (huérfanos — no bloquean el email, pero conviene borrarlos antes de relink)
select sp.id, sp.username, sp.app_role
from public.staff_profiles sp
left join auth.users au on au.id = sp.id
where (
  lower(coalesce(sp.username, '')) in ('sevitha', 'stf019')
  or lower(trim(coalesce(sp.full_name, ''))) = 'sevitha'
)
and au.id is null;

-- =============================================================================
-- 2) Limpieza — ejecutar SOLO si el paso 1 muestra filas que sobran
-- =============================================================================
-- 2a) Dos usuarios Auth (p. ej. sevitha@ + info@): deja UNO. Borra el duplicado sin perfil útil:
-- delete from auth.users where id = 'UUID-del-duplicado';

-- 2b) Usuario Auth info@ sin querer recrear: mejor Dashboard → Users → Reset password (no hace falta borrar).

-- 2c) Sigue existiendo info@ y quieres empezar de cero — borra identidades y usuario (service role / SQL Editor):
-- delete from auth.identities where user_id in (
--   select id from auth.users where lower(email) = lower('info@clubsensational.org')
-- );
-- delete from auth.users where lower(email) = lower('info@clubsensational.org');

-- 2d) Perfil staff huérfano (viejo UUID tras borrar Auth):
-- delete from public.staff_profiles sp
-- where sp.id in (
--   select sp2.id from public.staff_profiles sp2
--   left join auth.users au on au.id = sp2.id
--   where au.id is null
--     and lower(coalesce(sp2.username, '')) in ('sevitha', 'stf019')
-- );

-- =============================================================================
-- 3) Crear usuario en Supabase Dashboard → Authentication → Users → Add user
--    Email: info@clubsensational.org  ·  Password: (la nueva)  ·  Auto-confirm email: ON
-- =============================================================================

-- =============================================================================
-- 4) Enlazar staff_profiles al NUEVO auth.users.id (sustituye el UUID por el que veas en paso 1)
-- =============================================================================
-- insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
-- select au.id, 'Sevitha', 'Sevitha', 'admin', 'admin', 'admin_dashboard.html', true
-- from auth.users au
-- where lower(au.email) = lower('info@clubsensational.org')
-- on conflict (id) do update
-- set full_name = excluded.full_name,
--     username = excluded.username,
--     app_role = excluded.app_role,
--     staff_role = excluded.staff_role,
--     dashboard_route = excluded.dashboard_route,
--     is_active = true;

-- Si había datos ligados al UUID viejo de Sevitha, usa la plantilla completa:
--   supabase/migrations/20260603140000_portal_relink_sevitha_auth.sql
-- (cambia v_new al id del usuario info@ recién creado)

-- =============================================================================
-- 5) Comprobación
-- =============================================================================
select au.id, au.email, sp.username, sp.app_role, sp.is_active, (sp.id is not null) as profile_ok
from auth.users au
left join public.staff_profiles sp on sp.id = au.id
where lower(au.email) = lower('info@clubsensational.org');
