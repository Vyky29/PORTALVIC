select id, username, full_name, app_role
from staff_profiles
where lower(coalesce(username,'')) like '%simon%'
   or lower(coalesce(full_name,'')) like '%simon%';
