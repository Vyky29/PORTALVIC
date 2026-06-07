-- Self-service sync from staff/lead dashboards (bypasses PostgREST upsert + missing SELECT on conflict).

begin;

create or replace function public.portal_sync_my_training_progress(
  p_track text,
  p_current_module smallint default 0,
  p_modules_total smallint default 0,
  p_progress_pct smallint default 0,
  p_module_states jsonb default '{}'::jsonb,
  p_phase_label text default '',
  p_completed_at timestamptz default null
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
  if p_track is null or p_track not in ('induction', 'swimming_training', 'swimming_term_review') then
    raise exception 'invalid training track';
  end if;

  insert into public.portal_staff_training_progress (
    staff_user_id,
    track,
    current_module,
    modules_total,
    progress_pct,
    module_states,
    phase_label,
    completed_at,
    updated_at
  ) values (
    auth.uid(),
    p_track,
    coalesce(p_current_module, 0),
    coalesce(p_modules_total, 0),
    coalesce(p_progress_pct, 0),
    coalesce(p_module_states, '{}'::jsonb),
    coalesce(p_phase_label, ''),
    p_completed_at,
    now()
  )
  on conflict (staff_user_id, track) do update set
    current_module = excluded.current_module,
    modules_total = excluded.modules_total,
    progress_pct = excluded.progress_pct,
    module_states = excluded.module_states,
    phase_label = excluded.phase_label,
    completed_at = excluded.completed_at,
    updated_at = now();
end;
$$;

create or replace function public.portal_sync_my_setup_status(
  p_staff_display_name text default '',
  p_is_pwa boolean default false,
  p_push_enabled boolean default false,
  p_location_granted boolean default false,
  p_microphone_granted boolean default false,
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
    last_shell = excluded.last_shell,
    last_seen_at = excluded.last_seen_at,
    updated_at = now(),
    client_meta = excluded.client_meta;
end;
$$;

revoke all on function public.portal_sync_my_training_progress(text, smallint, smallint, smallint, jsonb, text, timestamptz) from public;
grant execute on function public.portal_sync_my_training_progress(text, smallint, smallint, smallint, jsonb, text, timestamptz) to authenticated;

revoke all on function public.portal_sync_my_setup_status(text, boolean, boolean, boolean, boolean, text, timestamptz, jsonb) from public;
grant execute on function public.portal_sync_my_setup_status(text, boolean, boolean, boolean, boolean, text, timestamptz, jsonb) to authenticated;

commit;
