-- Giuseppe, Andres, Bismark: staff portal login OK but documents-only (no roster/participants).
begin;

alter table public.staff_profiles
  add column if not exists portal_staff_access text not null default 'full';

alter table public.staff_profiles
  drop constraint if exists staff_profiles_portal_staff_access_chk;

alter table public.staff_profiles
  add constraint staff_profiles_portal_staff_access_chk
  check (portal_staff_access in ('full', 'documents_only'));

comment on column public.staff_profiles.portal_staff_access is
  'full = normal staff portal; documents_only = My Documents (+ own profile/contract sign) only.';

create or replace function public.portal_staff_profile_row_to_json(p_row public.staff_profiles)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'username', p_row.username,
    'full_name', p_row.full_name,
    'app_role', p_row.app_role,
    'staff_role', p_row.staff_role,
    'dashboard_route', p_row.dashboard_route,
    'auth_session_generation', p_row.auth_session_generation,
    'is_active', p_row.is_active,
    'nationality', p_row.nationality,
    'portal_staff_access', p_row.portal_staff_access
  );
$$;

update public.staff_profiles
set portal_staff_access = 'documents_only'
where lower(trim(coalesce(username, ''))) in ('giuseppe', 'andres', 'bismark');

delete from public.staff_participant_access spa
using public.staff_profiles sp
where spa.staff_id = sp.id
  and lower(trim(coalesce(sp.username, ''))) in ('giuseppe', 'andres', 'bismark');

commit;
