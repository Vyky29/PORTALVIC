-- Portal login: resolve staff_profiles for auth.uid(), auto-create from allowlisted emails only.
-- Fixes "No staff profile for this account" when Auth id != legacy placeholder id.
-- Run on project portal (cklpnwhlqsulpmkipmqb).

create table if not exists public.portal_auth_profile_templates (
  email_lower text primary key,
  username text not null,
  full_name text not null,
  app_role text not null,
  staff_role text not null,
  dashboard_route text not null
);

insert into public.portal_auth_profile_templates
  (email_lower, username, full_name, app_role, staff_role, dashboard_route)
values
  ('stf001@staff.import.pending', 'Sandra', 'Sandra Bartolome', 'staff', 'fitness', 'staff_dashboard.html'),
  ('stf002@staff.import.pending', 'Roberto', 'Roberto Reali', 'staff', 'swimming', 'staff_dashboard.html'),
  ('stf003@staff.import.pending', 'Dan', 'Dan Clarke', 'staff', 'swimming', 'staff_dashboard.html'),
  ('stf004@staff.import.pending', 'Angel', 'Angel Falceto', 'staff', 'swimming', 'staff_dashboard.html'),
  ('stf005@staff.import.pending', 'Youssef', 'Youssef Moustafa', 'staff', 'swimming', 'staff_dashboard.html'),
  ('johnnyosti37@gmail.com', 'John', 'John Kyei-Fram', 'lead', 'support', 'lead_dashboard.html'),
  ('stf007@staff.import.pending', 'Bismark', 'Bismark Gyan', 'staff', 'support', 'staff_dashboard.html'),
  ('stf008@staff.import.pending', 'Giuseppe', 'Giuseppe Morelli', 'staff', 'support', 'staff_dashboard.html'),
  ('stf009@staff.import.pending', 'Godsway', 'Godsway Yatofo', 'staff', 'support', 'staff_dashboard.html'),
  ('stf010@staff.import.pending', 'Javier', 'Javier Marquez', 'staff', 'swimming', 'staff_dashboard.html'),
  ('stf011@staff.import.pending', 'Aurora', 'Aurora Garcia', 'staff', 'swimming', 'staff_dashboard.html'),
  ('michelle@youtimecounselling.com', 'Michelle', 'Michelle', 'staff', 'support', 'staff_dashboard.html'),
  ('b.traperocasado@gmail.com', 'Berta', 'Berta Trapero Casado', 'lead', 'support', 'lead_dashboard.html'),
  ('victor@clubsensational.org', 'Victor', 'Victor', 'ceo', 'manager', 'ceo_dashboard.html'),
  ('stf014@staff.import.pending', 'Carlos', 'Carlos Herrero', 'staff', 'climbing', 'staff_dashboard.html'),
  ('stf015@staff.import.pending', 'Alex', 'Alex Stone', 'staff', 'climbing', 'staff_dashboard.html'),
  ('stf016@staff.import.pending', 'Simon', 'Simon Griffiths', 'staff', 'swimming', 'staff_dashboard.html'),
  ('stf020@staff.import.pending', 'Teflon', 'Demo', 'staff', 'swimming', 'staff_dashboard.html'),
  ('stf021@staff.import.pending', 'Luliya', 'Aida Lulia', 'staff', 'swimming', 'staff_dashboard.html'),
  ('stf022@staff.import.pending', 'Andres', 'Andres Borrego', 'staff', 'climbing', 'staff_dashboard.html'),
  ('javier@clubsensational.org', 'Javi', 'Javi Arranz Escorial', 'ceo', 'manager', 'ceo_dashboard.html'),
  ('javi@clubsensational.org', 'Javi', 'Javi Arranz Escorial', 'ceo', 'manager', 'ceo_dashboard.html'),
  ('raul@clubsensational.org', 'Raul', 'Raul', 'ceo', 'manager', 'ceo_dashboard.html'),
  ('sevitha@clubsensational.org', 'Sevitha', 'Sevitha', 'admin', 'admin', 'admin_dashboard.html')
on conflict (email_lower) do update set
  username = excluded.username,
  full_name = excluded.full_name,
  app_role = excluded.app_role,
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route;

revoke all on public.portal_auth_profile_templates from public, anon, authenticated;

create or replace function public.portal_get_session_staff_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_tpl public.portal_auth_profile_templates%rowtype;
  v_row public.staff_profiles%rowtype;
begin
  if v_uid is null then
    return null;
  end if;

  select sp.* into v_row
  from public.staff_profiles sp
  where sp.id = v_uid;

  if found then
    return jsonb_build_object(
      'id', v_row.id,
      'username', v_row.username,
      'full_name', v_row.full_name,
      'app_role', v_row.app_role,
      'staff_role', v_row.staff_role,
      'dashboard_route', v_row.dashboard_route,
      'auth_session_generation', v_row.auth_session_generation,
      'is_active', v_row.is_active,
      'nationality', v_row.nationality
    );
  end if;

  select lower(au.email) into v_email
  from auth.users au
  where au.id = v_uid;

  if v_email is null then
    return null;
  end if;

  select t.* into v_tpl
  from public.portal_auth_profile_templates t
  where t.email_lower = v_email;

  if not found then
    return null;
  end if;

  insert into public.staff_profiles
    (id, username, full_name, app_role, staff_role, dashboard_route, is_active)
  values
    (v_uid, v_tpl.username, v_tpl.full_name, v_tpl.app_role, v_tpl.staff_role, v_tpl.dashboard_route, true)
  on conflict (id) do update set
    username = excluded.username,
    full_name = excluded.full_name,
    app_role = excluded.app_role,
    staff_role = excluded.staff_role,
    dashboard_route = excluded.dashboard_route,
    is_active = true
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'full_name', v_row.full_name,
    'app_role', v_row.app_role,
    'staff_role', v_row.staff_role,
    'dashboard_route', v_row.dashboard_route,
    'auth_session_generation', v_row.auth_session_generation,
    'is_active', v_row.is_active,
    'nationality', v_row.nationality
  );
end;
$$;

comment on function public.portal_get_session_staff_profile() is
  'Returns staff_profiles row for auth.uid(); auto-creates from portal_auth_profile_templates when Auth email is allowlisted.';

revoke all on function public.portal_get_session_staff_profile() from public;
grant execute on function public.portal_get_session_staff_profile() to authenticated;

-- Backfill: ensure corporate Auth users already in auth.users have profiles (idempotent).
insert into public.staff_profiles (id, username, full_name, app_role, staff_role, dashboard_route, is_active)
select au.id, t.username, t.full_name, t.app_role, t.staff_role, t.dashboard_route, true
from auth.users au
join public.portal_auth_profile_templates t on t.email_lower = lower(au.email)
where not exists (select 1 from public.staff_profiles sp where sp.id = au.id)
on conflict (id) do update set
  username = excluded.username,
  full_name = excluded.full_name,
  app_role = excluded.app_role,
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route,
  is_active = true;
