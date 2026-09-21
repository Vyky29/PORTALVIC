-- Flag for hire onboarding portal access (Job/Health/Docs hub + Quick Menu).
-- Michelle backfilled; new invites set this via portal-staff-onboarding-invite.

alter table public.staff_profiles
  add column if not exists onboarding_applicant boolean not null default false;

comment on column public.staff_profiles.onboarding_applicant is
  'When true, staff Quick Menu shows Onboarding hub (Job/Health/Photo/Docs) until complete.';

update public.staff_profiles
set onboarding_applicant = true,
    updated_at = coalesce(updated_at, now())
where lower(trim(username)) = 'michelle'
   or lower(trim(full_name)) like 'michelle%';

-- Keep session RPC payload in sync with staff_profiles columns used by the portal.
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
    'portal_staff_access', p_row.portal_staff_access,
    'onboarding_applicant', coalesce(p_row.onboarding_applicant, false)
  );
$$;
