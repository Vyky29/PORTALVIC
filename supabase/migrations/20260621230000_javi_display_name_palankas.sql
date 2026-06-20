-- CEO display name: Palankas Arranz (emails unchanged: javi@ / javier@).
update public.staff_profiles
set
  full_name = 'Palankas Arranz Escorial',
  updated_at = now()
where lower(coalesce(username, '')) = 'javi'
   or lower(coalesce(full_name, '')) like 'javi arranz%'
   or id in (
     select id from auth.users
     where lower(email) in (
       'javi@clubsensational.org',
       'javier@clubsensational.org',
       'javier@clbusensational.org'
     )
   );
