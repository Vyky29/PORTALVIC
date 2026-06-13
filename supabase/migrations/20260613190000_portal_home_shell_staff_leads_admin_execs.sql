-- Home shells: John/Berta/Michelle → staff; Victor/Javi/Raúl → admin.
begin;

update public.staff_profiles
set dashboard_route = 'staff_dashboard.html'
where lower(trim(coalesce(username, ''))) in ('john', 'berta', 'michelle')
   or lower(trim(coalesce(full_name, ''))) like 'john %'
   or lower(trim(coalesce(full_name, ''))) like 'berta %'
   or lower(trim(coalesce(full_name, ''))) like 'michelle %';

update public.staff_profiles
set dashboard_route = 'admin_dashboard.html'
where lower(trim(coalesce(username, ''))) in ('victor', 'javi', 'raul')
   or lower(trim(coalesce(full_name, ''))) like 'victor %'
   or lower(trim(coalesce(full_name, ''))) like 'javi %'
   or lower(trim(coalesce(full_name, ''))) like 'raul %'
   or lower(trim(coalesce(full_name, ''))) like 'raúl %';

commit;
