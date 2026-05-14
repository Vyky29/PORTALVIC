-- Seed aligned to SPREADSHEETS inputs and generated machine exports in database/.
-- Prerequisite: every stf001…stf019 (except stf016) plus stf020 (Demo) must exist in auth.users first.
-- See supabase_portal_all_staff_login.sql for the checklist and diagnostic query.
-- id: deterministic placeholder (UUID v5). After creating auth users, set each id to that user’s auth.users.id.
-- STAFF.email was empty: create auth users separately; align emails with onboarding_auth_email in CSV or replace.
-- dashboard_route: staff /p1/, lead /l1/, CEOs /ce/ (prod: clubsensational.org/ce/), admin /operations-admin/
-- (prod admin shell is WordPress /operations-admin/, not /admin/). adjust if your deployed URLs differ.
-- Portal roles: CEO = Javi, Raul, Victor | Admin = Sevitha + CEOs | Leads = John, Berta | Staff = rest (CEOs also cover shifts).
-- Job roles (staff_role): swimming | fitness | climbing | support | manager | admin
--   Swimming: Aurora, Dan, Roberto, Javier, Angel, Youssef (+ Javi/Raul occasional pool)
--   Fitness: Sandra | Climbing: Alex, Carlos (+ Javi/Bismark occasional)
--   Support: Berta, John, Giuseppe, Bismark, Godsway (+ Victor occasional) | Admin: Sevitha
--   Manager (work title): Javi, Raul, Victor
--
-- Schema note: database/auth-handler.js queries .eq("user_id", …). If your table uses user_id instead of id,
-- rename the first column in this INSERT list (and values) to user_id, or add a view/trigger.

-- IMPORTANT (Supabase FK): public.staff_profiles.id must equal auth.users.id.
-- This seed inserts/updates profiles for Auth users that already exist (matched by email).

-- -----------------------------------------------------------------------------
-- [Incluido] CHECK app_role + staff_role (Run en todo el archivo)
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
