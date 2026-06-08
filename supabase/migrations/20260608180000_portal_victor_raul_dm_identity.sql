-- Ensure Victor / Raúl corporate Auth users map to the correct staff_profiles rows.
-- Fixes worker chat showing the wrong director when author_id resolves to a mismatched profile.
-- Run on Portal (cklpnwhlqsulpmkipmqb).

begin;

update public.staff_profiles sp
set
  username = 'Victor',
  full_name = 'Victor',
  app_role = 'ceo',
  staff_role = 'manager',
  dashboard_route = 'ceo_dashboard.html',
  is_active = true
from auth.users au
where sp.id = au.id
  and lower(au.email) = 'victor@clubsensational.org';

update public.staff_profiles sp
set
  username = 'Raul',
  full_name = 'Raul',
  app_role = 'ceo',
  staff_role = 'manager',
  dashboard_route = 'ceo_dashboard.html',
  is_active = true
from auth.users au
where sp.id = au.id
  and lower(au.email) = 'raul@clubsensational.org';

update public.portal_auth_profile_templates
set
  username = 'Victor',
  full_name = 'Victor',
  app_role = 'ceo',
  staff_role = 'manager',
  dashboard_route = 'ceo_dashboard.html'
where email_lower = 'victor@clubsensational.org';

update public.portal_auth_profile_templates
set
  username = 'Raul',
  full_name = 'Raul',
  app_role = 'ceo',
  staff_role = 'manager',
  dashboard_route = 'ceo_dashboard.html'
where email_lower = 'raul@clubsensational.org';

commit;
