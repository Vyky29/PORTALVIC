-- Force every active staff profile to re-login (remote auth_session_generation poll signs out open sessions).
-- Run in Portal Supabase SQL editor (ref cklpnwhlqsulpmkipmqb) before or right after deploying APP_VERSION bump.

begin;

update public.staff_profiles
   set auth_session_generation = coalesce(auth_session_generation, 0) + 1
 where coalesce(is_active, true) = true;

-- sanity: how many profiles bumped
select count(*) as active_profiles_bumped
  from public.staff_profiles
 where coalesce(is_active, true) = true;

commit;
