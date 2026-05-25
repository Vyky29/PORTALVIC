-- Portal: Victor, Javi, Raúl, Sevitha — solo @clubsensational.org (quitar stf013/017/018/019)
-- Sevitha: sevitha@clubsensational.org y/o info@clubsensational.org (un solo usuario Auth + staff_profiles)
--
-- Ejecutar en Supabase SQL Editor (proyecto Portal). Orden: 0 → 1 → 2 → 3

-- =============================================================================
-- 0) Estado actual
-- =============================================================================
select au.id, au.email, sp.username, sp.app_role, sp.staff_role
from auth.users au
left join public.staff_profiles sp on sp.id = au.id
where lower(au.email) in (
  lower('victor@clubsensational.org'),
  lower('javier@clubsensational.org'),
  lower('raul@clubsensational.org'),
  lower('sevitha@clubsensational.org'),
  lower('info@clubsensational.org'),
  lower('stf013@staff.import.pending'),
  lower('stf017@staff.import.pending'),
  lower('stf018@staff.import.pending'),
  lower('stf019@staff.import.pending')
)
order by au.email;

-- =============================================================================
-- 1) VICTOR — un usuario: victor@clubsensational.org + perfil
-- =============================================================================
delete from auth.users orphan
where lower(orphan.email) = lower('victor@clubsensational.org')
  and not exists (select 1 from public.staff_profiles sp where sp.id = orphan.id)
  and exists (
    select 1 from auth.users ph
    join public.staff_profiles sp on sp.id = ph.id
    where lower(ph.email) = lower('stf013@staff.import.pending')
  );

update auth.users
set email = 'victor@clubsensational.org',
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where lower(email) = lower('stf013@staff.import.pending')
  and not exists (
    select 1 from auth.users o
    where lower(o.email) = lower('victor@clubsensational.org') and o.id <> auth.users.id
  );

insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Victor', 'Victor', 'ceo', 'manager', 'ceo_dashboard.html', true
from auth.users au
where lower(au.email) = lower('victor@clubsensational.org')
on conflict (id) do update
set full_name = excluded.full_name, username = excluded.username,
    app_role = excluded.app_role, staff_role = excluded.staff_role,
    dashboard_route = excluded.dashboard_route, is_active = excluded.is_active;

delete from auth.users u
where lower(u.email) = lower('stf013@staff.import.pending')
  and exists (
    select 1 from auth.users c
    join public.staff_profiles sp on sp.id = c.id
    where lower(c.email) = lower('victor@clubsensational.org')
  );

-- =============================================================================
-- 2) JAVI (CEO) — javier@clubsensational.org (no confundir con Javier stf010 nadador)
-- =============================================================================
delete from auth.users orphan
where lower(orphan.email) = lower('javier@clubsensational.org')
  and not exists (select 1 from public.staff_profiles sp where sp.id = orphan.id)
  and exists (
    select 1 from auth.users ph
    join public.staff_profiles sp on sp.id = ph.id
    where lower(ph.email) = lower('stf017@staff.import.pending')
  );

update auth.users
set email = 'javier@clubsensational.org',
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where lower(email) = lower('stf017@staff.import.pending')
  and not exists (
    select 1 from auth.users o
    where lower(o.email) = lower('javier@clubsensational.org') and o.id <> auth.users.id
  );

insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Javi', 'Javi', 'ceo', 'manager', 'ceo_dashboard.html', true
from auth.users au
where lower(au.email) = lower('javier@clubsensational.org')
on conflict (id) do update
set full_name = excluded.full_name, username = excluded.username,
    app_role = excluded.app_role, staff_role = excluded.staff_role,
    dashboard_route = excluded.dashboard_route, is_active = excluded.is_active;

delete from auth.users u
where lower(u.email) = lower('stf017@staff.import.pending')
  and exists (
    select 1 from auth.users c
    join public.staff_profiles sp on sp.id = c.id
    where lower(c.email) = lower('javier@clubsensational.org')
  );

-- =============================================================================
-- 3) RAÚL — raul@clubsensational.org
-- =============================================================================
delete from auth.users orphan
where lower(orphan.email) = lower('raul@clubsensational.org')
  and not exists (select 1 from public.staff_profiles sp where sp.id = orphan.id)
  and exists (
    select 1 from auth.users ph
    join public.staff_profiles sp on sp.id = ph.id
    where lower(ph.email) = lower('stf018@staff.import.pending')
  );

update auth.users
set email = 'raul@clubsensational.org',
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where lower(email) = lower('stf018@staff.import.pending')
  and not exists (
    select 1 from auth.users o
    where lower(o.email) = lower('raul@clubsensational.org') and o.id <> auth.users.id
  );

insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Raul', 'Raul', 'ceo', 'manager', 'ceo_dashboard.html', true
from auth.users au
where lower(au.email) = lower('raul@clubsensational.org')
on conflict (id) do update
set full_name = excluded.full_name, username = excluded.username,
    app_role = excluded.app_role, staff_role = excluded.staff_role,
    dashboard_route = excluded.dashboard_route, is_active = excluded.is_active;

delete from auth.users u
where lower(u.email) = lower('stf018@staff.import.pending')
  and exists (
    select 1 from auth.users c
    join public.staff_profiles sp on sp.id = c.id
    where lower(c.email) = lower('raul@clubsensational.org')
  );

-- =============================================================================
-- 4) SEVITHA — sevitha@ y/o info@ (un solo login activo con perfil admin)
--     Si aún no hay Auth: créalo en Dashboard con info@ o sevitha@ + contraseña,
--     luego ejecuta solo el INSERT de abajo.
-- =============================================================================
delete from auth.users orphan
where lower(orphan.email) in (lower('sevitha@clubsensational.org'), lower('info@clubsensational.org'))
  and not exists (select 1 from public.staff_profiles sp where sp.id = orphan.id)
  and exists (
    select 1 from auth.users ph
    join public.staff_profiles sp on sp.id = ph.id
    where lower(ph.email) = lower('stf019@staff.import.pending')
  );

-- Mover placeholder → sevitha@ si no existe ya el corporativo
update auth.users
set email = 'sevitha@clubsensational.org',
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where lower(email) = lower('stf019@staff.import.pending')
  and not exists (
    select 1 from auth.users o
    where lower(o.email) = lower('sevitha@clubsensational.org') and o.id <> auth.users.id
  );

-- Opcional: renombrar sevitha@ → info@ (descomenta si el login oficial de Sevitha es info@)
-- update auth.users
-- set email = 'info@clubsensational.org',
--     email_confirmed_at = coalesce(email_confirmed_at, now()),
--     updated_at = now()
-- where lower(email) = lower('sevitha@clubsensational.org')
--   and not exists (
--     select 1 from auth.users o
--     where lower(o.email) = lower('info@clubsensational.org') and o.id <> auth.users.id
--   );

insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Sevitha', 'Sevitha', 'admin', 'admin', 'admin_dashboard.html', true
from auth.users au
where lower(au.email) in (
  lower('sevitha@clubsensational.org'),
  lower('info@clubsensational.org')
)
on conflict (id) do update
set full_name = excluded.full_name, username = excluded.username,
    app_role = excluded.app_role, staff_role = excluded.staff_role,
    dashboard_route = excluded.dashboard_route, is_active = excluded.is_active;

delete from auth.users u
where lower(u.email) = lower('stf019@staff.import.pending')
  and exists (
    select 1 from auth.users c
    join public.staff_profiles sp on sp.id = c.id
    where lower(c.email) in (
      lower('sevitha@clubsensational.org'),
      lower('info@clubsensational.org')
    )
  );

-- Si quedan DOS usuarios (sevitha@ + info@) con perfil, borra el duplicado sin datos:
-- (revisa el SELECT 0 antes de descomentar)
-- delete from auth.users where id = 'UUID-del-duplicado';

-- =============================================================================
-- 5) Comprobación final — solo corporativos, sin stf013/017/018/019
-- =============================================================================
select
  e.email,
  e.label,
  exists (select 1 from auth.users au where lower(au.email) = lower(e.email)) as auth_ok,
  exists (
    select 1 from auth.users au
    join public.staff_profiles sp on sp.id = au.id
    where lower(au.email) = lower(e.email)
  ) as profile_ok
from (
  values
    ('victor@clubsensational.org', 'Victor'),
    ('javier@clubsensational.org', 'Javi'),
    ('raul@clubsensational.org', 'Raul'),
    ('sevitha@clubsensational.org', 'Sevitha'),
    ('info@clubsensational.org', 'Sevitha (info@)')
) as e(email, label)
order by e.label;

select count(*) as placeholder_accounts_left
from auth.users
where lower(email) in (
  lower('stf013@staff.import.pending'),
  lower('stf017@staff.import.pending'),
  lower('stf018@staff.import.pending'),
  lower('stf019@staff.import.pending')
);
-- placeholder_accounts_left debe ser 0
