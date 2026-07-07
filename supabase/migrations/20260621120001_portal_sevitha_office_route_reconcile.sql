-- Reconcile Sevitha dashboard_route after office portal (safe if 20260613180000 was skipped).

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

commit;
