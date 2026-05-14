-- Canonical display names for portal / staff_profile_update (OTP identity match uses full_name).
-- Safe to re-run.

begin;

update public.staff_profiles
set full_name = 'Javi Arranz Escorial'
where lower(trim(username)) = 'javi';

update public.staff_profiles
set full_name = 'Javier Marquez'
where lower(trim(username)) = 'javier';

commit;
