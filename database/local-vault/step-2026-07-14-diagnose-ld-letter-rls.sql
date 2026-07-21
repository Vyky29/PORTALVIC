select sp.id, sp.full_name, sp.username, sp.app_role, sp.staff_role, sp.is_active,
  public.portal_profile_staff_key(sp.id) as staff_key,
  au.email
from public.staff_profiles sp
left join auth.users au on au.id = sp.id
where lower(coalesce(sp.username,'')) in ('javi','javier','palankas')
   or lower(coalesce(sp.full_name,'')) like '%javi%'
   or lower(coalesce(sp.full_name,'')) like '%palankas%'
   or lower(coalesce(au.email,'')) like '%javi%'
   or lower(coalesce(au.email,'')) like '%javier%'
order by sp.full_name;
