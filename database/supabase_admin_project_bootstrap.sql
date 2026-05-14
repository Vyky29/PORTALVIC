-- ==============================================================================
-- PORTAL — Staff Profile Self-Update flow: bootstrap completo para proyecto NUEVO
-- ==============================================================================
-- Destino: proyecto Supabase aptbbkmvkjybjgrrwxpr (donde la admin Sevitha
-- puede ver lo que llega).
--
-- Crea desde CERO:
--   - public.staff_profiles                  (tabla base + columnas self-update)
--   - public.staff_profile_update_otps       (OTPs hasheados, 10 min TTL)
--   - public.staff_profile_update_sessions   (token temporal post-OTP)
--   - public.staff_profile_change_log        (audit trail por campo)
--   - Helpers SQL: portal_normalize_full_name, portal_normalize_phone_digits,
--                  portal_staff_profile_is_admin_or_ceo,
--                  portal_bump_auth_session_generation,
--                  staff_profile_match_identity (security definer, anti-enumeration)
--   - 22 auth.users del staff (password de prueba: 990099)
--   - 22 staff_profiles vinculados con teléfonos del Excel
--   - Andres Borrego con dirección, DOB y nacionalidad ya cargados
--   - Row Level Security activada en todo
--
-- Idempotente: lo puedes ejecutar más de una vez sin romper nada.
-- ==============================================================================

begin;

-- ------------------------------------------------------------------------------
-- A) Tabla base: staff_profiles
-- ------------------------------------------------------------------------------
create table if not exists public.staff_profiles (
  id                              uuid primary key references auth.users(id) on delete cascade,
  username                        text unique,
  full_name                       text,
  app_role                        text,
  staff_role                      text,
  dashboard_route                 text,
  is_active                       boolean not null default true,
  auth_session_generation         bigint  not null default 0,
  -- Self-service profile-update columns
  phone_e164                      text,
  email_personal                  text,
  address_line1                   text,
  address_line2                   text,
  address_city                    text,
  address_postcode                text,
  emergency_contact_name          text,
  emergency_contact_relationship  text,
  emergency_contact_phone         text,
  availability_summary            text,
  availability_status             text,
  availability_changes            jsonb,
  other_work_status               text,
  other_work_organisation         text,
  other_work_schedule             text,
  other_work_affects_availability boolean,
  wellbeing_notes                 text,
  date_of_birth                   date,
  nationality                     text,
  profile_last_confirmed_at       timestamptz,
  profile_last_updated_at         timestamptz,
  created_at                      timestamptz not null default now()
);

-- phone_lookup: columna generada (solo dígitos) para matching tolerante.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'staff_profiles'
      and column_name  = 'phone_lookup'
  ) then
    alter table public.staff_profiles
      add column phone_lookup text generated always as
        (regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g')) stored;
  end if;
end $$;

create index if not exists staff_profiles_phone_lookup_idx
  on public.staff_profiles (phone_lookup)
  where phone_lookup is not null and phone_lookup <> '';

-- CHECK constraints (idempotentes)
alter table public.staff_profiles drop constraint if exists staff_profiles_app_role_allowed;
alter table public.staff_profiles
  add constraint staff_profiles_app_role_allowed
  check (app_role in ('admin','ceo','lead','staff'));

alter table public.staff_profiles drop constraint if exists staff_profiles_staff_role_allowed;
alter table public.staff_profiles
  add constraint staff_profiles_staff_role_allowed
  check (staff_role is null or staff_role in
    ('swimming','fitness','climbing','support','manager','admin'));

alter table public.staff_profiles drop constraint if exists staff_profiles_availability_status_chk;
alter table public.staff_profiles
  add constraint staff_profiles_availability_status_chk
  check (availability_status is null or availability_status
    in ('continue','reduce','increase','unsure'));

alter table public.staff_profiles drop constraint if exists staff_profiles_other_work_status_chk;
alter table public.staff_profiles
  add constraint staff_profiles_other_work_status_chk
  check (other_work_status is null or other_work_status
    in ('only_clubsensational','also_other'));

-- ------------------------------------------------------------------------------
-- B) Helpers
-- ------------------------------------------------------------------------------
create or replace function public.portal_staff_profile_is_admin_or_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.app_role in ('admin','ceo')
  );
$$;
revoke all on function public.portal_staff_profile_is_admin_or_ceo() from public;
grant execute on function public.portal_staff_profile_is_admin_or_ceo() to authenticated;

create or replace function public.portal_bump_auth_session_generation()
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  update public.staff_profiles
     set auth_session_generation = coalesce(auth_session_generation, 0) + 1
   where id = auth.uid()
   returning auth_session_generation into v;
  return v;
end $$;
grant execute on function public.portal_bump_auth_session_generation() to authenticated;

create or replace function public.portal_normalize_full_name(p text)
returns text language sql immutable as $$
  select trim(regexp_replace(
    lower(translate(coalesce(p,''),
      'ÁÀÂÄÃÅáàâäãåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇç''’´`',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc      ')),
    '\s+',' ','g'));
$$;

create or replace function public.portal_normalize_phone_digits(p text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p,''),'\D','','g');
$$;

-- match_identity: SECURITY DEFINER. Solo la service_role lo puede ejecutar
-- (para que la anon key no pueda usarse como oráculo de enumeración).
create or replace function public.staff_profile_match_identity(
  p_full_name text, p_phone text
) returns uuid language sql stable security definer set search_path = public as $$
  with norm as (
    select public.portal_normalize_full_name(p_full_name) as fn_norm,
           public.portal_normalize_phone_digits(p_phone)  as ph_norm
  ),
  candidates as (
    select sp.id from public.staff_profiles sp, norm
    where coalesce(sp.is_active, true)
      and norm.fn_norm <> '' and norm.ph_norm <> ''
      and length(norm.ph_norm) >= 7
      and (public.portal_normalize_full_name(sp.full_name) = norm.fn_norm
           or public.portal_normalize_full_name(sp.username) = norm.fn_norm)
      and right(sp.phone_lookup, 10) = right(norm.ph_norm, 10)
    limit 2
  ),
  agg as (select array_agg(id) as ids, count(*) as n from candidates)
  select case when n = 1 then ids[1] else null end from agg;
$$;
revoke all on function public.staff_profile_match_identity(text,text) from public;
revoke all on function public.staff_profile_match_identity(text,text) from anon;
revoke all on function public.staff_profile_match_identity(text,text) from authenticated;
grant execute on function public.staff_profile_match_identity(text,text) to service_role;

-- ------------------------------------------------------------------------------
-- C) RLS en staff_profiles
-- ------------------------------------------------------------------------------
alter table public.staff_profiles enable row level security;

drop policy if exists "staff can read own profile" on public.staff_profiles;
create policy "staff can read own profile" on public.staff_profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "staff_profiles_admin_ceo_directory_read" on public.staff_profiles;
create policy "staff_profiles_admin_ceo_directory_read" on public.staff_profiles
  for select to authenticated using (public.portal_staff_profile_is_admin_or_ceo());

-- ------------------------------------------------------------------------------
-- D) Tablas del flujo (OTP / session / audit)
-- ------------------------------------------------------------------------------
create table if not exists public.staff_profile_update_otps (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references public.staff_profiles(id) on delete cascade,
  code_hash       text not null,
  channel         text not null check (channel in ('whatsapp','sms','log')),
  destination     text not null,
  expires_at      timestamptz not null,
  attempts        smallint not null default 0,
  consumed_at     timestamptz,
  created_at      timestamptz not null default now(),
  ip_hash         text,
  user_agent_hash text
);
create index if not exists staff_profile_update_otps_staff_idx
  on public.staff_profile_update_otps (staff_id, created_at desc);
create index if not exists staff_profile_update_otps_active_idx
  on public.staff_profile_update_otps (staff_id)
  where consumed_at is null;
alter table public.staff_profile_update_otps enable row level security;
revoke all on public.staff_profile_update_otps from public, anon, authenticated;

create table if not exists public.staff_profile_update_sessions (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references public.staff_profiles(id) on delete cascade,
  token_hash      text not null unique,
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz not null,
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  ip_hash         text,
  user_agent_hash text
);
create index if not exists staff_profile_update_sessions_staff_idx
  on public.staff_profile_update_sessions (staff_id, issued_at desc);
create index if not exists staff_profile_update_sessions_token_idx
  on public.staff_profile_update_sessions (token_hash);
alter table public.staff_profile_update_sessions enable row level security;
revoke all on public.staff_profile_update_sessions from public, anon, authenticated;

create table if not exists public.staff_profile_change_log (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references public.staff_profiles(id) on delete cascade,
  section         text not null,
  field_name      text not null,
  previous_value  text,
  new_value       text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null,
  source          text not null default 'staff_self_update',
  ip_hash         text,
  user_agent_hash text
);
create index if not exists staff_profile_change_log_staff_idx
  on public.staff_profile_change_log (staff_id, updated_at desc);
alter table public.staff_profile_change_log enable row level security;
revoke all on public.staff_profile_change_log from public, anon, authenticated;

drop policy if exists "staff_profile_change_log_admin_read" on public.staff_profile_change_log;
create policy "staff_profile_change_log_admin_read" on public.staff_profile_change_log
  for select to authenticated using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists "staff_profile_change_log_self_read" on public.staff_profile_change_log;
create policy "staff_profile_change_log_self_read" on public.staff_profile_change_log
  for select to authenticated using ((select auth.uid()) = staff_id);

-- ------------------------------------------------------------------------------
-- E) auth.users del staff (password de prueba: 990099)
-- ------------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  gen_random_uuid(), 'authenticated', 'authenticated',
  v.email, crypt('990099', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, false, false
from (values
  ('stf001@staff.import.pending'),('stf002@staff.import.pending'),
  ('stf003@staff.import.pending'),('stf004@staff.import.pending'),
  ('stf005@staff.import.pending'),('stf006@staff.import.pending'),
  ('stf007@staff.import.pending'),('stf008@staff.import.pending'),
  ('stf009@staff.import.pending'),('stf010@staff.import.pending'),
  ('stf011@staff.import.pending'),('stf012@staff.import.pending'),
  ('stf013@staff.import.pending'),('stf014@staff.import.pending'),
  ('stf015@staff.import.pending'),('stf016@staff.import.pending'),
  ('stf017@staff.import.pending'),('stf018@staff.import.pending'),
  ('stf019@staff.import.pending'),('stf020@staff.import.pending'),
  ('stf021@staff.import.pending'),('stf022@staff.import.pending')
) as v(email)
where not exists (select 1 from auth.users au where lower(au.email) = lower(v.email));

-- ------------------------------------------------------------------------------
-- F) staff_profiles con teléfonos del Excel (+ Andres con dirección/DOB)
-- ------------------------------------------------------------------------------
with map(username, full_name, auth_email, app_role, staff_role, dashboard_route, phone) as (values
  ('Sandra',  'Sandra Bartolome',     'stf001@staff.import.pending','staff','fitness',  '/p1/','+447516121704'),
  ('Roberto', 'Roberto Reali',        'stf002@staff.import.pending','staff','swimming', '/p1/','+447827567963'),
  ('Dan',     'Dan Clarke',           'stf003@staff.import.pending','staff','swimming', '/p1/','+447921219021'),
  ('Angel',   'Angel Falceto',        'stf004@staff.import.pending','staff','swimming', '/p1/','+447716582565'),
  ('Youssef', 'Youssef Moustafa',     'stf005@staff.import.pending','staff','swimming', '/p1/','+447919891212'),
  ('John',    'John Kyei-Fram',       'stf006@staff.import.pending','lead', 'support',  '/l1/','+447741072712'),
  ('Bismark', 'Bismark Gyan',         'stf007@staff.import.pending','staff','support',  '/p1/','+447510488944'),
  ('Giuseppe','Giuseppe Morelli',     'stf008@staff.import.pending','staff','support',  '/p1/','+447541611664'),
  ('Godsway', 'Godsway Yatofo',       'stf009@staff.import.pending','staff','support',  '/p1/','+447442797241'),
  ('Javier',  'Javier Marquez',       'stf010@staff.import.pending','staff','swimming', '/p1/','+447523494240'),
  ('Aurora',  'Aurora Garcia',        'stf011@staff.import.pending','staff','swimming', '/p1/','+447473228203'),
  ('Berta',   'Berta Trapero Casado', 'stf012@staff.import.pending','lead', 'support',  '/l1/','+447523492621'),
  ('Victor',  'Victor',               'stf013@staff.import.pending','ceo',  'manager',  '/ce/','+447715444979'),
  ('Carlos',  'Carlos Herrero',       'stf014@staff.import.pending','staff','climbing', '/p1/','+447873439001'),
  ('Alex',    'Alex Stone',           'stf015@staff.import.pending','staff','climbing', '/p1/','+447414724084'),
  ('simon',   'Simon Griffiths',      'stf016@staff.import.pending','staff','swimming', '/p1/','+447775897684'),
  ('Javi',    'Javi Arranz Escorial', 'stf017@staff.import.pending','ceo',  'manager',  '/ce/', null),
  ('Raul',    'Raul',                 'stf018@staff.import.pending','ceo',  'manager',  '/ce/', null),
  ('Sevitha', 'Sevitha',              'stf019@staff.import.pending','admin','admin',    '/operations-admin/', null),
  ('demo',    'Demo',                 'stf020@staff.import.pending','staff','swimming', '/p1/', null),
  ('aida',    'Aida Lulia',           'stf021@staff.import.pending','staff','swimming', '/p1/','+447728281298'),
  ('andres',  'Andres Borrego',       'stf022@staff.import.pending','staff','climbing', '/p1/','+447864966958')
),
auth_map as (
  select m.*, au.id as auth_user_id
  from map m
  join auth.users au on lower(au.email) = lower(m.auth_email)
)
insert into public.staff_profiles
  (id, username, full_name, app_role, staff_role, dashboard_route, is_active, phone_e164)
select
  auth_user_id, username, full_name, app_role, staff_role, dashboard_route, true, phone
from auth_map
on conflict (id) do update
set username        = excluded.username,
    full_name       = excluded.full_name,
    app_role        = excluded.app_role,
    staff_role      = excluded.staff_role,
    dashboard_route = excluded.dashboard_route,
    is_active       = excluded.is_active,
    phone_e164      = coalesce(excluded.phone_e164, public.staff_profiles.phone_e164);

-- Datos extra de Andres (dirección + DOB + nacionalidad ya conocidos).
update public.staff_profiles
   set address_line1    = '19 Tamarisk Square',
       address_postcode = 'W12 0QE',
       date_of_birth    = date '1991-02-15',
       nationality      = 'Spanish'
 where username = 'andres'
   and (address_line1 is null or date_of_birth is null);

commit;

-- ==============================================================================
-- Verificación rápida (ejecuta a continuación si quieres comprobar)
-- ==============================================================================
-- select username, full_name, app_role, staff_role, phone_e164, phone_lookup
-- from public.staff_profiles
-- order by username;
--
-- Esperado: 22 filas, con teléfonos rellenos en 17 (incluido Victor) y null en
-- Javi / Raul / Sevitha / Demo.
--
-- Después de esto:
--   1) Crea las 5 Edge Functions en este mismo proyecto:
--      - staff-profile-session-from-portal
--      - staff-profile-otp-request
--      - staff-profile-otp-verify
--      - staff-profile-update-load
--      - staff-profile-update-save
--   2) Pega el contenido de cada index.ts desde:
--      supabase/functions/<nombre>/index.ts
--   3) Sube working_ui/staff_profile_update.html a WordPress (ya apunta aquí).
-- ==============================================================================
