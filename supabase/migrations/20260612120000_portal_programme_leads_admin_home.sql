-- John, Berta, Michelle: login home is staff_dashboard.html (app_role stays lead for programme permissions).
-- Staff dashboard: lead tools (Service Leads menu) for these users.
begin;

update public.staff_profiles
set dashboard_route = 'staff_dashboard.html'
where lower(trim(coalesce(username, ''))) in ('john', 'berta', 'michelle')
   or lower(trim(coalesce(full_name, ''))) like 'john %'
   or lower(trim(coalesce(full_name, ''))) like 'berta %'
   or lower(trim(coalesce(full_name, ''))) like 'michelle %';

commit;
