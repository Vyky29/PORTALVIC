-- Admin live presence bar: who is online now (visit heartbeats + live GPS), security definer.

begin;

create or replace function public.portal_admin_fetch_online_staff(
  p_visit_stale_seconds integer default 90
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security to off
as $$
  with london_today as (
    select (timezone('Europe/London', now()))::date as d
  ),
  loc as (
    select
      l.staff_user_id,
      l.staff_display_name as name,
      l.updated_at as at
    from public.portal_staff_live_locations l
    where public.portal_staff_can_view_live_map()
      and l.is_sharing = true
      and l.updated_at >= now() - interval '20 minutes'
  ),
  visits as (
    select
      v.staff_user_id,
      v.staff_display_name as name,
      v.last_seen_at as at
    from public.portal_staff_visit_sessions v
    cross join london_today lt
    where public.portal_staff_can_view_live_map()
      and v.still_open = true
      and v.session_date = lt.d
      and v.last_seen_at >= now() - make_interval(secs => greatest(coalesce(p_visit_stale_seconds, 90), 30))
  ),
  merged as (
    select * from loc
    union all
    select * from visits
  ),
  deduped as (
    select distinct on (staff_user_id)
      staff_user_id,
      name,
      at
    from merged
    order by staff_user_id, at desc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'staff_user_id', staff_user_id,
        'name', name,
        'at', at
      )
      order by lower(trim(coalesce(name, '')))
    ),
    '[]'::jsonb
  )
  from deduped;
$$;

revoke all on function public.portal_admin_fetch_online_staff(integer) from public;
grant execute on function public.portal_admin_fetch_online_staff(integer) to authenticated;

comment on function public.portal_admin_fetch_online_staff(integer) is
  'Admin Online bar supplement: staff with open visit session (recent heartbeat) or sharing live location.';

commit;
