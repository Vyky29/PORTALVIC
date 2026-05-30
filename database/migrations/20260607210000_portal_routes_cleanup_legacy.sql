-- Cosmetic cleanup of dashboard_route (the login routes by app_role, not by this
-- column — the old /p1/, /ce/, /l1/ WordPress paths were just stale). Also disable
-- the legacy duplicate account arranz_legacy via is_active (login now honours it).

begin;

-- Safety: the login now selects is_active, so make sure the column exists.
alter table public.staff_profiles
  add column if not exists is_active boolean not null default true;

-- Make dashboard_route reflect the real per-role HTML the login actually uses.
update public.staff_profiles
set dashboard_route = case app_role
  when 'ceo'   then 'ceo_dashboard.html'
  when 'admin' then 'admin_dashboard.html'
  when 'lead'  then 'lead_dashboard.html'
  else 'staff_dashboard.html'
end;

-- Disable the legacy Javier Arranz duplicate (real CEO account is 'arranz').
update public.staff_profiles
set is_active = false,
    auth_session_generation = coalesce(auth_session_generation, 0) + 1
where lower(username) = 'arranz_legacy';

commit;
