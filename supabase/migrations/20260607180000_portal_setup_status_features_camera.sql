-- Portal features setup + camera for admin App & Device Readiness tracking.

begin;

alter table public.portal_staff_setup_status
  add column if not exists camera_granted boolean not null default false;

alter table public.portal_staff_setup_status
  add column if not exists portal_features_complete boolean not null default false;

alter table public.portal_staff_setup_status
  add column if not exists portal_features_completed_at timestamptz null;

comment on column public.portal_staff_setup_status.camera_granted is
  'Browser camera permission granted for video calls and achievement photos.';

comment on column public.portal_staff_setup_status.portal_features_complete is
  'Mandatory portal setup done on device: alerts + camera (+ location when role requires live map).';

drop function if exists public.portal_sync_my_setup_status(text, boolean, boolean, boolean, boolean, text, timestamptz, jsonb);

create or replace function public.portal_sync_my_setup_status(
  p_staff_display_name text default '',
  p_is_pwa boolean default false,
  p_push_enabled boolean default false,
  p_location_granted boolean default false,
  p_microphone_granted boolean default false,
  p_camera_granted boolean default false,
  p_portal_features_complete boolean default false,
  p_portal_features_completed_at timestamptz default null,
  p_last_shell text default 'browser',
  p_last_seen_at timestamptz default null,
  p_client_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.portal_staff_setup_status (
    staff_user_id,
    staff_display_name,
    is_pwa,
    push_enabled,
    location_granted,
    microphone_granted,
    camera_granted,
    portal_features_complete,
    portal_features_completed_at,
    last_shell,
    last_seen_at,
    updated_at,
    client_meta
  ) values (
    auth.uid(),
    coalesce(p_staff_display_name, ''),
    coalesce(p_is_pwa, false),
    coalesce(p_push_enabled, false),
    coalesce(p_location_granted, false),
    coalesce(p_microphone_granted, false),
    coalesce(p_camera_granted, false),
    coalesce(p_portal_features_complete, false),
    p_portal_features_completed_at,
    coalesce(nullif(trim(p_last_shell), ''), 'browser'),
    coalesce(p_last_seen_at, now()),
    now(),
    coalesce(p_client_meta, '{}'::jsonb)
  )
  on conflict (staff_user_id) do update set
    staff_display_name = excluded.staff_display_name,
    is_pwa = excluded.is_pwa,
    push_enabled = excluded.push_enabled,
    location_granted = excluded.location_granted,
    microphone_granted = excluded.microphone_granted,
    camera_granted = excluded.camera_granted,
    portal_features_complete = excluded.portal_features_complete,
    portal_features_completed_at = coalesce(
      excluded.portal_features_completed_at,
      portal_staff_setup_status.portal_features_completed_at
    ),
    last_shell = excluded.last_shell,
    last_seen_at = excluded.last_seen_at,
    updated_at = now(),
    client_meta = excluded.client_meta;
end;
$$;

revoke all on function public.portal_sync_my_setup_status(
  text, boolean, boolean, boolean, boolean, boolean, boolean, timestamptz, text, timestamptz, jsonb
) from public;
grant execute on function public.portal_sync_my_setup_status(
  text, boolean, boolean, boolean, boolean, boolean, boolean, timestamptz, text, timestamptz, jsonb
) to authenticated;

commit;
