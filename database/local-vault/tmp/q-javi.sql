select id::text, full_name, username, app_role, staff_role, public.portal_profile_staff_key(id) as staff_key from public.staff_profiles where id = 'e5fa86e6-b03a-4d5c-a0bb-1d6dee2ff8ee';
