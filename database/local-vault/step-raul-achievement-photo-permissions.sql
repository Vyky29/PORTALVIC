-- Manual fix: achievement photo "portal permissions" error (Raúl, pool workers, etc.)
-- Supabase SQL Editor → Portal (cklpnwhlqsulpmkipmqb)
-- Paste and run the full contents of:
--   supabase/migrations/20260701170000_portal_achievement_upload_rls_reassert.sql
--
-- Then Raúl: sign out → sign in again as raul@clubsensational.org

select
  au.id,
  au.email,
  sp.username,
  sp.app_role,
  sp.staff_role,
  sp.is_active,
  public.portal_profile_staff_key(sp.id) as staff_key,
  (sp.id is not null) as profile_ok
from auth.users au
left join public.staff_profiles sp on sp.id = au.id
where lower(au.email) = lower('raul@clubsensational.org');
