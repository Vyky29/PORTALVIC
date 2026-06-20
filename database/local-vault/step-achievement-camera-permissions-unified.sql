-- Copy-paste in Supabase SQL Editor (Portal project) if migration 20260701160000 is not applied yet.
-- Run AFTER 20260701150000 (or instead of it for the permission functions below).

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

revoke all on function public.portal_auth_email_is_achievement_admin() from public;
grant execute on function public.portal_auth_email_is_achievement_admin() to authenticated;

create or replace function public.portal_staff_profile_is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security = off
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

revoke all on function public.portal_staff_can_use_achievement_photos() from public;
grant execute on function public.portal_staff_can_use_achievement_photos() to authenticated;

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

-- Verify (replace with a real staff auth uid if testing):
-- select public.portal_staff_can_use_achievement_photos();
-- select public.portal_staff_profile_is_admin_or_ceo();
