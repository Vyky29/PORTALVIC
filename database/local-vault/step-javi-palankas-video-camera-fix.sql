-- Portal (cklpnwhlqsulpmkipmqb) — Javi / Palankas achievement VIDEO + camera upload fix
-- Run in Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (idempotent).

begin;

-- 1) Video columns on achievement table (skip if 20260626200000 already ran)
alter table public.portal_participant_achievement_photos
  add column if not exists media_type text not null default 'photo',
  add column if not exists duration_ms int null;

alter table public.portal_participant_achievement_photos
  drop constraint if exists portal_achievement_photos_media_type_check;

alter table public.portal_participant_achievement_photos
  add constraint portal_achievement_photos_media_type_check
  check (media_type in ('photo', 'video'));

-- 2) Storage bucket: allow video MIME + 50 MB (browser uploads webm/mp4)
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

-- 3) Fix username normalisation: "Javi" was becoming "avi" (uppercase J stripped)
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

-- 4) CEO/admin check — incl. Palankas display name key
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

-- 5) Who may upload photos/videos — staff/lead OR CEO OR corporate email
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

revoke all on function public.portal_staff_can_use_achievement_photos() from public;
grant execute on function public.portal_staff_can_use_achievement_photos() to authenticated;

-- 6) Ensure Javi Auth user has linked staff_profiles row (CEO)
insert into public.staff_profiles (
  id, username, full_name, app_role, staff_role, dashboard_route, is_active
)
select
  au.id,
  'Javi',
  'Palankas Arranz Escorial',
  'ceo',
  'manager',
  'ceo_dashboard.html',
  true
from auth.users au
where lower(au.email) in (
  'javier@clubsensational.org',
  'javi@clubsensational.org',
  'javier@clbusensational.org'
)
on conflict (id) do update set
  username = excluded.username,
  full_name = excluded.full_name,
  app_role = 'ceo',
  staff_role = excluded.staff_role,
  dashboard_route = excluded.dashboard_route,
  is_active = true;

commit;

-- =============================================================================
-- VERIFY (run after commit — expect staff_key = javi, can_admin = true)
-- =============================================================================
select
  au.email,
  sp.username,
  sp.full_name,
  sp.app_role,
  sp.is_active,
  public.portal_normalize_staff_key(sp.username) as norm_username,
  public.portal_profile_staff_key(sp.id) as staff_key
from auth.users au
join public.staff_profiles sp on sp.id = au.id
where lower(au.email) in (
  'javier@clubsensational.org',
  'javi@clubsensational.org'
);

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'portal_participant_achievement_photos'
  and column_name in ('media_type', 'duration_ms');

select id, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'participant-achievements';
