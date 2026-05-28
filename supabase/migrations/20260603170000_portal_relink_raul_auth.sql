-- Raúl: new Auth user after delete/recreate + password 121212.
-- Run on Portal Supabase (cklpnwhlqsulpmkipmqb) in SQL Editor.
-- New auth.users.id: 69bb3b02-e5f1-4e95-9334-285281d0a190

begin;

create extension if not exists pgcrypto;

do $portal$
declare
  v_new constant uuid := '69bb3b02-e5f1-4e95-9334-285281d0a190'::uuid;
  v_old uuid;
begin
  if not exists (select 1 from auth.users au where au.id = v_new) then
    raise exception 'auth.users % not found. Create Raúl in Authentication first (raul@clubsensational.org).', v_new;
  end if;

  for v_old in
    select sp.id
    from public.staff_profiles sp
    where sp.id <> v_new
      and (
        lower(coalesce(sp.username, '')) in ('raul', 'raúl', 'stf018')
        or lower(trim(coalesce(sp.full_name, ''))) in ('raul', 'raúl')
        or lower(trim(coalesce(sp.full_name, ''))) like 'raul%'
      )
  loop
    update public.staff_profile_change_log
    set staff_id = v_new
    where staff_id = v_old;

    update public.staff_profile_update_otps
    set staff_id = v_new
    where staff_id = v_old;

    update public.staff_profile_update_sessions
    set staff_id = v_new
    where staff_id = v_old;

    if to_regclass('public.portal_staff_dm_threads') is not null then
      update public.portal_staff_dm_threads
      set participant_a = v_new
      where participant_a = v_old
        and v_new < participant_b;

      update public.portal_staff_dm_threads
      set
        participant_a = participant_b,
        participant_b = v_new
      where participant_a = v_old
        and v_new > participant_b;

      update public.portal_staff_dm_threads
      set participant_b = v_new
      where participant_b = v_old
        and participant_a < v_new;

      update public.portal_staff_dm_threads
      set
        participant_a = v_new,
        participant_b = participant_a
      where participant_b = v_old
        and v_new < participant_a;
    end if;

    delete from public.staff_profiles where id = v_old;
  end loop;
end
$portal$;

insert into public.staff_profiles (
  id,
  full_name,
  username,
  app_role,
  staff_role,
  dashboard_route,
  is_active
)
select
  au.id,
  'Raul',
  'Raul',
  'ceo',
  'manager',
  'ceo_dashboard.html',
  true
from auth.users au
where au.id = '69bb3b02-e5f1-4e95-9334-285281d0a190'::uuid
on conflict (id) do update
set
  full_name = excluded.full_name,
  username = excluded.username,
  app_role = excluded.app_role,
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route,
  is_active = true;

update auth.users
set
  encrypted_password = crypt('121212', gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where id = '69bb3b02-e5f1-4e95-9334-285281d0a190'::uuid;

delete from auth.users u
where lower(u.email) = lower('stf018@staff.import.pending')
  and u.id <> '69bb3b02-e5f1-4e95-9334-285281d0a190'::uuid
  and exists (
    select 1
    from auth.users c
    where c.id = '69bb3b02-e5f1-4e95-9334-285281d0a190'::uuid
  );

commit;

select
  au.id,
  au.email,
  sp.username,
  sp.app_role,
  sp.dashboard_route,
  sp.is_active,
  (sp.id is not null) as profile_ok
from auth.users au
left join public.staff_profiles sp on sp.id = au.id
where au.id = '69bb3b02-e5f1-4e95-9334-285281d0a190'::uuid;
