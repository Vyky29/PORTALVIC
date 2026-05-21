-- Point staff_profiles.dashboard_route at Vercel HTML filenames (not legacy /p1, /l0, /l1).
-- Safe to run multiple times on Portal Supabase.

UPDATE public.staff_profiles
SET dashboard_route = 'staff_dashboard.html'
WHERE dashboard_route IN ('/p1/', '/p1', 'p1', 'p1/');

UPDATE public.staff_profiles
SET dashboard_route = 'lead_dashboard.html'
WHERE dashboard_route IN ('/l1/', '/l1', 'l1', 'l1/');

UPDATE public.staff_profiles
SET dashboard_route = 'ceo_dashboard.html'
WHERE dashboard_route IN ('/ce/', '/ce', 'ce', 'ce/');

UPDATE public.staff_profiles
SET dashboard_route = 'admin_dashboard.html'
WHERE dashboard_route IN (
  '/operations-admin/',
  '/operations-admin',
  'operations-admin',
  '/a1/',
  '/a1'
);
