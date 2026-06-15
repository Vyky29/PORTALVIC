-- Sevitha: home = office portal (payroll + personal docs), not full operations admin dashboard.

begin;

update public.staff_profiles sp
set
  dashboard_route = 'office_portal.html',
  updated_at = now()
from auth.users au
where sp.id = au.id
  and lower(au.email) in (
    lower('sevitha@clubsensational.org'),
    lower('info@clubsensational.org')
  );

comment on column public.staff_profiles.dashboard_route is
  'Post-login static page under working_ui/. Sevitha uses office_portal.html; executives use admin_dashboard.html.';

commit;
