select id, username, full_name, app_role from staff_profiles
where lower(coalesce(username,'')) like '%simon%'
   or lower(coalesce(full_name,'')) like '%simon%';

-- function definition live
select pg_get_functiondef('public.portal_schedule_anchor_staff_matches_me(text)'::regprocedure);
