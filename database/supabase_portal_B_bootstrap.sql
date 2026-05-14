-- Una sola sentencia: RUN. Rellena dashboard_route / app_role / staff_role solo si estaban vacíos.
-- Incluye fix CHECK app_role + staff_role al inicio: ejecuta el archivo entero.

-- -----------------------------------------------------------------------------
-- [Incluido] CHECK app_role + staff_role
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
    ('Victor','stf013@staff.import.pending','/ce/','ceo','support'),
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
