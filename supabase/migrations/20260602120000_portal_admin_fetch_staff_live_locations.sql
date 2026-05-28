-- Admin map read path via security definer (avoids intermittent RLS / REST 403).

begin;

create or replace function public.portal_admin_fetch_staff_live_locations(
  p_stale_minutes integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security to off
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'staff_user_id', l.staff_user_id,
        'staff_display_name', l.staff_display_name,
        'staff_surface', l.staff_surface,
        'latitude', l.latitude,
        'longitude', l.longitude,
        'accuracy_m', l.accuracy_m,
        'updated_at', l.updated_at,
        'is_sharing', l.is_sharing
      )
      order by l.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.portal_staff_live_locations l
  where public.portal_staff_can_view_live_map()
    and l.is_sharing = true
    and l.updated_at >= now() - make_interval(mins => greatest(coalesce(p_stale_minutes, 20), 1));
$$;

revoke all on function public.portal_admin_fetch_staff_live_locations(integer) from public;
grant execute on function public.portal_admin_fetch_staff_live_locations(integer) to authenticated;

comment on function public.portal_admin_fetch_staff_live_locations(integer) is
  'Live map: rows for admin/ceo/manager viewers (security definer).';

commit;
