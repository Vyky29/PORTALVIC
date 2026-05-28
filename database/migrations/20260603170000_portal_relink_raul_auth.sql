-- Raúl: new Auth user after delete/recreate + password 121212.
-- Run on Portal Supabase (cklpnwhlqsulpmkipmqb) in SQL Editor.
-- New auth.users.id: 69bb3b02-e5f1-4e95-9334-285281d0a190

begin;

create extension if not exists pgcrypto;

-- Reassign auth.users FKs before deleting a stale Auth row (e.g. session_feedback).
create or replace function public._portal_relink_auth_user_fks(p_old uuid, p_new uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $fn$
begin
  if p_old is null or p_new is null or p_old = p_new then
    return;
  end if;

  if to_regclass('public.session_feedback') is not null then
    update public.session_feedback set submitted_by_user_id = p_new where submitted_by_user_id = p_old;
  end if;
  if to_regclass('public.cancellation_reports') is not null then
    update public.cancellation_reports set submitted_by_user_id = p_new where submitted_by_user_id = p_old;
  end if;
  if to_regclass('public.venue_reviews') is not null then
    update public.venue_reviews set submitted_by_user_id = p_new where submitted_by_user_id = p_old;
  end if;
  if to_regclass('public.incident_reports') is not null then
    update public.incident_reports set submitted_by_user_id = p_new where submitted_by_user_id = p_old;
  end if;
  if to_regclass('public.expense_claims') is not null then
    update public.expense_claims set submitted_by_user_id = p_new where submitted_by_user_id = p_old;
  end if;
  if to_regclass('public.lead_session_reports') is not null then
    update public.lead_session_reports set submitted_by_user_id = p_new where submitted_by_user_id = p_old;
  end if;
  if to_regclass('public.leader_term_reviews') is not null then
    update public.leader_term_reviews set submitted_by_user_id = p_new where submitted_by_user_id = p_old;
  end if;
  if to_regclass('public.staff_observation_reports') is not null then
    update public.staff_observation_reports set submitted_by_user_id = p_new where submitted_by_user_id = p_old;
  end if;
  if to_regclass('public.staff_timesheets') is not null then
    update public.staff_timesheets set submitted_by_user_id = p_new where submitted_by_user_id = p_old;
  end if;
  if to_regclass('public.staff_pay_rates') is not null then
    delete from public.staff_pay_rates where user_id = p_old;
  end if;
  if to_regclass('public.schedule_overrides') is not null then
    update public.schedule_overrides set created_by = p_new where created_by = p_old;
    update public.schedule_overrides set updated_by = p_new where updated_by = p_old;
  end if;
  if to_regclass('public.schedule_override_audit') is not null then
    update public.schedule_override_audit set actor_id = p_new where actor_id = p_old;
  end if;
  if to_regclass('public.staff_performance_reviews') is not null then
    update public.staff_performance_reviews set subject_user_id = p_new where subject_user_id = p_old;
    update public.staff_performance_reviews set reviewer_user_id = p_new where reviewer_user_id = p_old;
  end if;
  if to_regclass('public.employment_contracts') is not null then
    update public.employment_contracts set user_id = p_new where user_id = p_old;
    update public.employment_contracts set created_by_user_id = p_new where created_by_user_id = p_old;
  end if;
  if to_regclass('public.portal_staff_announcements') is not null then
    update public.portal_staff_announcements set created_by = p_new where created_by = p_old;
    update public.portal_staff_announcements set target_user_id = p_new where target_user_id = p_old;
  end if;
  if to_regclass('public.portal_staff_dm_threads') is not null then
    update public.portal_staff_dm_threads set created_by = p_new where created_by = p_old;
  end if;
  if to_regclass('public.portal_staff_dm_messages') is not null then
    update public.portal_staff_dm_messages set author_id = p_new where author_id = p_old;
  end if;
  if to_regclass('public.portal_participant_achievement_photos') is not null then
    update public.portal_participant_achievement_photos set staff_user_id = p_new where staff_user_id = p_old;
  end if;
  if to_regclass('public.portal_staff_visit_sessions') is not null then
    update public.portal_staff_visit_sessions set staff_user_id = p_new where staff_user_id = p_old;
  end if;
  if to_regclass('public.portal_late_submission_requests') is not null then
    update public.portal_late_submission_requests set staff_user_id = p_new where staff_user_id = p_old;
    update public.portal_late_submission_requests set reviewed_by_user_id = p_new where reviewed_by_user_id = p_old;
  end if;
  if to_regclass('public.portal_staff_session_quick_marks') is not null then
    update public.portal_staff_session_quick_marks set staff_user_id = p_new where staff_user_id = p_old;
  end if;
  if to_regclass('public.portal_staff_live_locations') is not null then
    delete from public.portal_staff_live_locations where staff_user_id = p_old;
  end if;
end;
$fn$;

do $portal$
declare
  v_new constant uuid := '69bb3b02-e5f1-4e95-9334-285281d0a190'::uuid;
  v_old uuid;
  v_placeholder uuid;
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
    perform public._portal_relink_auth_user_fks(v_old, v_new);

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

  select u.id
  into v_placeholder
  from auth.users u
  where lower(u.email) = lower('stf018@staff.import.pending')
    and u.id <> v_new
  limit 1;

  if v_placeholder is not null then
    perform public._portal_relink_auth_user_fks(v_placeholder, v_new);
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
