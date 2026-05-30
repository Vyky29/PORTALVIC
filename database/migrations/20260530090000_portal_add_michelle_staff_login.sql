-- Give Michelle a working portal login (Swimming instructor, SwimFarm).
-- Run on Portal Supabase (cklpnwhlqsulpmkipmqb) in SQL Editor.
--
-- A staff_profiles row with username 'Michelle' already exists, but it was not
-- linked to her Auth user, so login failed. This RELINKS that profile to the
-- Auth user stf021@staff.import.pending (same approach as the Sevitha/Raul fixes)
-- instead of inserting a duplicate (which trips staff_profiles_username_key).
--
-- Prereq: create the Auth user stf021@staff.import.pending with her password first:
--   set PORTAL_STAFF_ONLY_EMAIL=stf021@staff.import.pending
--   set PORTAL_STAFF_BOOTSTRAP_PASSWORD=555555
--   python database/provision_staff_auth_users.py
-- (555555 is 6 chars, so it passes the default minimum password length.)
--
-- staff_profiles.id must equal auth.users.id.

begin;

do $portal$
declare
  v_new uuid;
  v_old uuid;
begin
  select au.id
  into v_new
  from auth.users au
  where lower(au.email) = lower('stf021@staff.import.pending')
  limit 1;

  if v_new is null then
    raise exception 'Auth user stf021@staff.import.pending not found. Create it first (provision_staff_auth_users.py), then re-run.';
  end if;

  -- Move any existing "Michelle" profile rows (wrong id) onto the real Auth user.
  for v_old in
    select sp.id
    from public.staff_profiles sp
    where sp.id <> v_new
      and (
        lower(coalesce(sp.username, '')) = 'michelle'
        or lower(trim(coalesce(sp.full_name, ''))) = 'michelle'
      )
  loop
    if to_regprocedure('public._portal_relink_auth_user_fks(uuid,uuid)') is not null then
      perform public._portal_relink_auth_user_fks(v_old, v_new);
    end if;

    if to_regclass('public.staff_profile_change_log') is not null then
      update public.staff_profile_change_log set staff_id = v_new where staff_id = v_old;
    end if;
    if to_regclass('public.staff_profile_update_otps') is not null then
      update public.staff_profile_update_otps set staff_id = v_new where staff_id = v_old;
    end if;
    if to_regclass('public.staff_profile_update_sessions') is not null then
      update public.staff_profile_update_sessions set staff_id = v_new where staff_id = v_old;
    end if;

    delete from public.staff_profiles where id = v_old;
  end loop;

  insert into public.staff_profiles (
    id, full_name, username, app_role, staff_role, dashboard_route, is_active
  )
  values (
    v_new, 'Michelle', 'Michelle', 'staff', 'swimming', 'staff_dashboard.html', true
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    username = excluded.username,
    app_role = excluded.app_role,
    staff_role = excluded.staff_role,
    dashboard_route = excluded.dashboard_route,
    is_active = true;
end
$portal$;

commit;

-- Check (expect profile_ok = true, is_active = true):
select
  au.email,
  sp.username,
  sp.app_role,
  sp.dashboard_route,
  sp.is_active,
  (sp.id is not null) as profile_ok
from auth.users au
left join public.staff_profiles sp on sp.id = au.id
where lower(au.email) = lower('stf021@staff.import.pending');
