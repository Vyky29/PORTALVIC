-- Sevitha: new Auth user after delete/recreate.
-- Run on Portal Supabase (cklpnwhlqsulpmkipmqb) in SQL Editor.
-- New auth.users.id: d365ab5c-e190-461a-a390-31e54b0b066f

begin;

do $portal$
declare
  v_new constant uuid := 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid;
  v_old uuid;
  v_placeholder uuid;
begin
  if not exists (select 1 from auth.users au where au.id = v_new) then
    raise exception 'auth.users % not found. Create Sevitha in Authentication first.', v_new;
  end if;

  for v_old in
    select sp.id
    from public.staff_profiles sp
    where sp.id <> v_new
      and (
        lower(coalesce(sp.username, '')) in ('sevitha', 'stf019')
        or lower(trim(coalesce(sp.full_name, ''))) = 'sevitha'
      )
  loop
    if to_regprocedure('public._portal_relink_auth_user_fks(uuid,uuid)') is not null then
      perform public._portal_relink_auth_user_fks(v_old, v_new);
    end if;

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
      -- participant_a < participant_b (ordered UUID pair); swap columns when v_new breaks order
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

  if to_regprocedure('public._portal_relink_auth_user_fks(uuid,uuid)') is not null then
    select u.id
    into v_placeholder
    from auth.users u
    where lower(u.email) = lower('stf019@staff.import.pending')
      and u.id <> v_new
    limit 1;

    if v_placeholder is not null then
      perform public._portal_relink_auth_user_fks(v_placeholder, v_new);
    end if;
  end if;
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
  'Sevitha',
  'Sevitha',
  'admin',
  'admin',
  'admin_dashboard.html',
  true
from auth.users au
where au.id = 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid
on conflict (id) do update
set
  full_name = excluded.full_name,
  username = excluded.username,
  app_role = excluded.app_role,
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route,
  is_active = true;

-- Optional: drop stale placeholder Auth row if it still exists
delete from auth.users u
where lower(u.email) = lower('stf019@staff.import.pending')
  and u.id <> 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid
  and exists (
    select 1
    from auth.users c
    where c.id = 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid
  );

commit;

-- Check (should show profile_ok = true)
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
where au.id = 'd365ab5c-e190-461a-a390-31e54b0b066f'::uuid;
