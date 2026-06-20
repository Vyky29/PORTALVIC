-- Unified achievement camera: photos + videos for all pool workers; admin inbox assign for Sevitha + CEOs.
-- Fixes regression in 20260701150000 that dropped swimming/climbing staff_role access.
-- Palankas login javier@clubsensational.org → roster javi (not instructor javier).

begin;

create or replace function public.portal_auth_email_is_achievement_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid())
      and lower(u.email) in (
        'victor@clubsensational.org',
        'raul@clubsensational.org',
        'javier@clubsensational.org',
        'javi@clubsensational.org',
        'javier@clbusensational.org',
        'sevitha@clubsensational.org',
        'info@clubsensational.org'
      )
  );
$$;

comment on function public.portal_auth_email_is_achievement_admin() is
  'Corporate Auth emails that may manage achievement inbox + admin photo tools (Sevitha, Victor, Raúl, Javi Palankas).';

revoke all on function public.portal_auth_email_is_achievement_admin() from public;
grant execute on function public.portal_auth_email_is_achievement_admin() to authenticated;

create or replace function public.portal_staff_profile_is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select
    public.portal_auth_email_is_achievement_admin()
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and coalesce(sp.is_active, true)
        and (
          sp.app_role in ('admin', 'ceo')
          or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
          or public.portal_profile_staff_key(sp.id) in (
            'sevitha', 'victor', 'javi', 'palankas', 'raul'
          )
        )
    );
$$;

comment on function public.portal_staff_profile_is_admin_or_ceo() is
  'Admin/CEO achievement inbox + directory: app_role admin/ceo, Sevitha, Victor, Raúl, Javi Palankas (javi/palankas — not instructor javier).';

create or replace function public.portal_staff_can_use_achievement_photos()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    public.portal_staff_profile_is_admin_or_ceo()
    or public.portal_staff_is_staff_or_lead()
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and sp.is_active is distinct from false
        and (
          lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) in ('staff', 'lead')
          or (
            lower(coalesce(sp.app_role, '')) not in ('admin', 'ceo')
            and lower(coalesce(sp.staff_role, '')) in (
              'swimming', 'climbing', 'fitness', 'support', 'support_lead', 'lead', 'manager'
            )
          )
        )
    )
    or exists (
      select 1
      from auth.users u
      where u.id = (select auth.uid())
        and lower(u.email) in (
          'victor@clubsensational.org',
          'raul@clubsensational.org',
          'javier@clubsensational.org',
          'javi@clubsensational.org',
          'javier@clbusensational.org',
          'sevitha@clubsensational.org',
          'info@clubsensational.org'
        )
    );
$$;

comment on function public.portal_staff_can_use_achievement_photos() is
  'Staff, lead, pool workers (staff_role), admin/CEO, or corporate Auth email — capture/upload photos and videos.';

revoke all on function public.portal_staff_can_use_achievement_photos() from public;
grant execute on function public.portal_staff_can_use_achievement_photos() to authenticated;

-- Re-assert video MIME types on bucket (idempotent).
update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'video/webm',
    'video/mp4',
    'video/quicktime'
  ]::text[]
where id = 'participant-achievements';

commit;
