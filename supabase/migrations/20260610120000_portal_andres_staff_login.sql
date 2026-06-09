-- Andres Borrego: staff portal login (climbing · Sunday roster).
-- Idempotent: pin row + auth password sync for stf022@staff.import.pending.

begin;

create extension if not exists pgcrypto;

insert into public.portal_login_pins (portal, display_order, name, roles, pin)
values ('staff', 22, 'Andres Borrego', 'Climbing Instructor 3', '4726')
on conflict (portal, name) do update
  set display_order = excluded.display_order,
      roles = excluded.roles,
      pin = excluded.pin;

insert into public.portal_auth_profile_templates
  (email_lower, username, full_name, app_role, staff_role, dashboard_route)
values
  ('stf022@staff.import.pending', 'Andres', 'Andres Borrego', 'staff', 'climbing', 'staff_dashboard.html')
on conflict (email_lower) do update set
  username = excluded.username,
  full_name = excluded.full_name,
  app_role = excluded.app_role,
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route;

update auth.users au
set
  encrypted_password = crypt('4726', gen_salt('bf')),
  updated_at = now()
from public.staff_profiles sp
where sp.id = au.id
  and lower(trim(sp.username)) = 'andres'
  and au.email = 'stf022@staff.import.pending';

commit;
