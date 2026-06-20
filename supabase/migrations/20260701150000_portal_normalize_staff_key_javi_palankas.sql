-- Fix portal_normalize_staff_key: uppercase letters were stripped before lower()
-- ("Javi" → "avi" instead of "javi"). Also harden CEO achievement photo/video RLS for Palankas.

begin;

create or replace function public.portal_normalize_staff_key(raw text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(
      translate(
        coalesce(trim(raw), ''),
        'áàäâãåéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
        'aaaaaaeeeeiiiioooooouuuuncAAAAAAEEEEIIIIOOOOOOUUUUNC'
      )
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

comment on function public.portal_normalize_staff_key(text) is
  'Lowercase alphanumeric staff key; accents stripped. Lowercases before removing non-alphanumerics.';

create or replace function public.portal_staff_profile_is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and coalesce(sp.is_active, true)
      and (
        sp.app_role in ('admin', 'ceo')
        or public.portal_profile_staff_key(sp.id) in (
          'sevitha', 'victor', 'javi', 'javier', 'raul', 'palankas'
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
set row_security to off
as $$
  select
    public.portal_staff_is_staff_or_lead()
    or public.portal_staff_profile_is_admin_or_ceo()
    or exists (
      select 1
      from auth.users u
      where u.id = (select auth.uid())
        and lower(u.email) in (
          'victor@clubsensational.org',
          'javier@clubsensational.org',
          'javi@clubsensational.org',
          'javier@clbusensational.org',
          'raul@clubsensational.org',
          'sevitha@clubsensational.org',
          'info@clubsensational.org'
        )
    );
$$;

comment on function public.portal_staff_can_use_achievement_photos() is
  'Staff, lead, admin, CEO, or allowlisted corporate Auth email — capture/upload achievement photos/videos.';

-- Re-assert video bucket limits (idempotent if 20260626200000 already ran).
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
