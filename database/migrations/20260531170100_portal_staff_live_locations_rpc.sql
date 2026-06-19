-- Reliable live-location writes via security definer RPC (avoids RLS / app_role edge cases).

begin;

create or replace function public.portal_staff_can_share_live_location()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and coalesce(sp.is_active, true)
      and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) in ('staff', 'lead')
  );
$$;

revoke all on function public.portal_staff_can_share_live_location() from public;
grant execute on function public.portal_staff_can_share_live_location() to authenticated;

drop policy if exists portal_staff_live_locations_insert_own on public.portal_staff_live_locations;
create policy portal_staff_live_locations_insert_own
  on public.portal_staff_live_locations
  for insert
  to authenticated
  with check (
    staff_user_id = auth.uid()
    and public.portal_staff_can_share_live_location()
  );

drop policy if exists portal_staff_live_locations_update_own on public.portal_staff_live_locations;
create policy portal_staff_live_locations_update_own
  on public.portal_staff_live_locations
  for update
  to authenticated
  using (
    staff_user_id = auth.uid()
    and public.portal_staff_can_share_live_location()
  )
  with check (staff_user_id = auth.uid());

-- Primary write path from staff/lead dashboards (security definer).
create or replace function public.portal_upsert_staff_live_location(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision default 25,
  p_staff_display_name text default null,
  p_staff_surface text default 'staff'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_surface text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = v_uid
      and coalesce(sp.is_active, true)
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_staff_profile');
  end if;

  if p_latitude is null
    or p_longitude is null
    or p_latitude < -90
    or p_latitude > 90
    or p_longitude < -180
    or p_longitude > 180 then
    return jsonb_build_object('ok', false, 'error', 'invalid_coordinates');
  end if;

  v_name := coalesce(nullif(trim(p_staff_display_name), ''), '');
  v_surface := coalesce(nullif(trim(p_staff_surface), ''), 'staff');

  insert into public.portal_staff_live_locations (
    staff_user_id,
    staff_display_name,
    staff_surface,
    latitude,
    longitude,
    accuracy_m,
    updated_at,
    is_sharing
  )
  values (
    v_uid,
    v_name,
    v_surface,
    p_latitude,
    p_longitude,
    greatest(coalesce(p_accuracy_m, 25), 3),
    now(),
    true
  )
  on conflict (staff_user_id) do update
  set
    staff_display_name = excluded.staff_display_name,
    staff_surface = excluded.staff_surface,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m,
    updated_at = excluded.updated_at,
    is_sharing = true;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.portal_upsert_staff_live_location(double precision, double precision, double precision, text, text) from public;
grant execute on function public.portal_upsert_staff_live_location(double precision, double precision, double precision, text, text) to authenticated;

create or replace function public.portal_stop_staff_live_location()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.portal_staff_live_locations
  set is_sharing = false, updated_at = now()
  where staff_user_id = auth.uid();
end;
$$;

revoke all on function public.portal_stop_staff_live_location() from public;
grant execute on function public.portal_stop_staff_live_location() to authenticated;

commit;
