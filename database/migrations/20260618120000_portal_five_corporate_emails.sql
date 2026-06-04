-- Portal: five @clubsensational.org roles — 4 Auth logins + org mailboxes
-- Run in Supabase SQL Editor (project portal · cklpnwhlqsulpmkipmqb)
--
-- Auth users (create/set password in Dashboard if missing):
--   victor@, javier@, raul@  → ceo + staff_profiles
--   sevitha@                 → admin (Sevitha)
-- Login alias in app: info@ → same Auth as sevitha@ (no second Auth user)
-- Not Auth logins: admin@ (system From), management@ (safeguarding)

-- =============================================================================
-- 0) Estado
-- =============================================================================
select au.id, au.email, sp.username, sp.app_role, sp.is_active
from auth.users au
left join public.staff_profiles sp on sp.id = au.id
where lower(au.email) in (
  lower('victor@clubsensational.org'),
  lower('javier@clubsensational.org'),
  lower('raul@clubsensational.org'),
  lower('sevitha@clubsensational.org'),
  lower('info@clubsensational.org'),
  lower('sevitha802@gmail.com'),
  lower('stf013@staff.import.pending'),
  lower('stf017@staff.import.pending'),
  lower('stf018@staff.import.pending'),
  lower('stf019@staff.import.pending')
)
order by au.email;

-- =============================================================================
-- 1) Quitar duplicados Auth (info@ huérfano, Gmail Sevitha, placeholders)
-- =============================================================================

-- info@ sin perfil si ya existe sevitha@ con perfil
delete from auth.identities i
where i.user_id in (
  select orphan.id from auth.users orphan
  where lower(orphan.email) = lower('info@clubsensational.org')
    and not exists (select 1 from public.staff_profiles sp where sp.id = orphan.id)
    and exists (
      select 1 from auth.users canon
      join public.staff_profiles sp on sp.id = canon.id
      where lower(canon.email) = lower('sevitha@clubsensational.org')
    )
);
delete from auth.users orphan
where lower(orphan.email) = lower('info@clubsensational.org')
  and not exists (select 1 from public.staff_profiles sp where sp.id = orphan.id)
  and exists (
    select 1 from auth.users canon
    join public.staff_profiles sp on sp.id = canon.id
    where lower(canon.email) = lower('sevitha@clubsensational.org')
  );

-- Si el único login Sevitha era info@, renómbralo a sevitha@ (descomenta si aplica tras revisar paso 0)
-- update auth.users
-- set email = 'sevitha@clubsensational.org',
--     email_confirmed_at = coalesce(email_confirmed_at, now()),
--     updated_at = now()
-- where lower(email) = lower('info@clubsensational.org')
--   and not exists (
--     select 1 from auth.users o
--     where lower(o.email) = lower('sevitha@clubsensational.org') and o.id <> auth.users.id
--   );

-- Gmail personal: relink FKs to sevitha@ before delete (chat/DM history)
do $merge_sevitha$
declare
  v_old constant uuid := 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid;
  v_new uuid;
begin
  select au.id into v_new
  from auth.users au
  where lower(au.email) = lower('sevitha@clubsensational.org')
  limit 1;

  if v_new is null or v_old = v_new then
    return;
  end if;

  if to_regprocedure('public._portal_relink_auth_user_fks(uuid,uuid)') is not null then
    perform public._portal_relink_auth_user_fks(v_old, v_new);
  end if;

  update public.staff_profile_change_log set staff_id = v_new where staff_id = v_old;
  update public.staff_profile_update_otps set staff_id = v_new where staff_id = v_old;
  update public.staff_profile_update_sessions set staff_id = v_new where staff_id = v_old;

  if to_regclass('public.portal_staff_dm_threads') is not null then
    update public.portal_staff_dm_threads set participant_a = v_new where participant_a = v_old and v_new < participant_b;
    update public.portal_staff_dm_threads set participant_b = v_new where participant_b = v_old and participant_a < v_new;
    update public.portal_staff_dm_threads set participant_a = participant_b, participant_b = v_new
    where participant_a = v_old and v_new > participant_b;
    update public.portal_staff_dm_threads set participant_a = v_new, participant_b = participant_a
    where participant_b = v_old and v_new < participant_a;
  end if;

  if to_regclass('public.portal_staff_dm_messages') is not null then
    update public.portal_staff_dm_messages set author_id = v_new where author_id = v_old;
  end if;

  delete from public.staff_profiles where id = v_old;
  delete from auth.identities where user_id = v_old;
  delete from auth.users where id = v_old;
end
$merge_sevitha$;

-- Placeholders CEO/admin si ya hay corporativo con perfil
delete from auth.users u
where lower(u.email) = lower('stf013@staff.import.pending')
  and exists (
    select 1 from auth.users c join public.staff_profiles sp on sp.id = c.id
    where lower(c.email) = lower('victor@clubsensational.org')
  );
delete from auth.users u
where lower(u.email) = lower('stf017@staff.import.pending')
  and exists (
    select 1 from auth.users c join public.staff_profiles sp on sp.id = c.id
    where lower(c.email) = lower('javier@clubsensational.org')
  );
delete from auth.users u
where lower(u.email) = lower('stf018@staff.import.pending')
  and exists (
    select 1 from auth.users c join public.staff_profiles sp on sp.id = c.id
    where lower(c.email) = lower('raul@clubsensational.org')
  );
delete from auth.users u
where lower(u.email) = lower('stf019@staff.import.pending')
  and exists (
    select 1 from auth.users c join public.staff_profiles sp on sp.id = c.id
    where lower(c.email) = lower('sevitha@clubsensational.org')
  );

-- Perfiles staff huérfanos (UUID sin Auth)
delete from public.staff_profiles sp
where sp.id in (
  select sp2.id from public.staff_profiles sp2
  left join auth.users au on au.id = sp2.id
  where au.id is null
    and (
      lower(coalesce(sp2.username, '')) in ('victor', 'javi', 'raul', 'sevitha', 'stf013', 'stf017', 'stf018', 'stf019')
      or lower(trim(coalesce(sp2.full_name, ''))) in ('victor', 'javi', 'raul', 'sevitha')
    )
);

-- =============================================================================
-- 2) staff_profiles para cada Auth corporativo existente
-- =============================================================================
insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Victor', 'Victor', 'ceo', 'manager', 'ceo_dashboard.html', true
from auth.users au where lower(au.email) = lower('victor@clubsensational.org')
on conflict (id) do update set
  full_name = excluded.full_name, username = excluded.username,
  app_role = excluded.app_role, staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route, is_active = true;

insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Javi', 'Javi', 'ceo', 'manager', 'ceo_dashboard.html', true
from auth.users au where lower(au.email) = lower('javier@clubsensational.org')
on conflict (id) do update set
  full_name = excluded.full_name, username = excluded.username,
  app_role = excluded.app_role, staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route, is_active = true;

insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Raul', 'Raul', 'ceo', 'manager', 'ceo_dashboard.html', true
from auth.users au where lower(au.email) = lower('raul@clubsensational.org')
on conflict (id) do update set
  full_name = excluded.full_name, username = excluded.username,
  app_role = excluded.app_role, staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route, is_active = true;

insert into public.staff_profiles (id, full_name, username, app_role, staff_role, dashboard_route, is_active)
select au.id, 'Sevitha', 'Sevitha', 'admin', 'admin', 'admin_dashboard.html', true
from auth.users au where lower(au.email) = lower('sevitha@clubsensational.org')
on conflict (id) do update set
  full_name = excluded.full_name, username = excluded.username,
  app_role = excluded.app_role, staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route, is_active = true;

-- Opcional: guardar Gmail antiguo solo como dato HR (no login)
-- update public.staff_profiles set email_personal = 'sevitha802@gmail.com'
-- where id in (select id from auth.users where lower(email) = lower('sevitha@clubsensational.org'));

-- =============================================================================
-- 3) Contraseñas ejecutivos (misma política que 20260608130100; ajusta en prod)
-- =============================================================================
begin;
create extension if not exists pgcrypto;
update auth.users
set encrypted_password = crypt('121212', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where lower(email) in (
  lower('victor@clubsensational.org'),
  lower('raul@clubsensational.org'),
  lower('javier@clubsensational.org'),
  lower('sevitha@clubsensational.org')
);
commit;

-- =============================================================================
-- 4) Comprobación
-- =============================================================================
select
  e.email,
  e.role_label,
  exists (select 1 from auth.users au where lower(au.email) = lower(e.email)) as auth_ok,
  exists (
    select 1 from auth.users au join public.staff_profiles sp on sp.id = au.id
    where lower(au.email) = lower(e.email)
  ) as profile_ok
from (
  values
    ('victor@clubsensational.org', 'CEO Victor'),
    ('javier@clubsensational.org', 'CEO Javi'),
    ('raul@clubsensational.org', 'CEO Raul'),
    ('sevitha@clubsensational.org', 'Admin Sevitha (Auth)'),
    ('info@clubsensational.org', 'Alias login → sevitha@ (no 2nd Auth)'),
    ('admin@clubsensational.org', 'System From only')
) as e(email, role_label)
order by e.role_label;
