-- Admin Staff Readiness: detect whether setup was done on the worker's own device
-- or the same physical browser/phone used for multiple staff accounts (push endpoint + UA).

begin;

create or replace function public.portal_admin_fetch_staff_device_attribution()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security to off
as $$
  with staff as (
    select
      sp.id as staff_user_id,
      coalesce(nullif(trim(sp.full_name), ''), nullif(trim(sp.username), ''), 'Staff') as staff_display_name
    from public.staff_profiles sp
    where sp.is_active = true
  ),
  setup as (
    select
      s.staff_user_id,
      s.push_enabled,
      s.location_granted,
      s.is_pwa,
      s.last_seen_at,
      coalesce(nullif(trim(s.client_meta->>'ua'), ''), '') as ua
    from public.portal_staff_setup_status s
  ),
  subs as (
    select
      pps.user_id as staff_user_id,
      pps.endpoint,
      pps.updated_at,
      row_number() over (partition by pps.user_id order by pps.updated_at desc nulls last) as rn
    from public.portal_push_subscriptions pps
  ),
  latest_sub as (
    select staff_user_id, endpoint, updated_at
    from subs
    where rn = 1
  ),
  shared_endpoints as (
    select
      endpoint,
      count(distinct user_id)::integer as account_count,
      array_agg(distinct user_id order by user_id) as user_ids
    from public.portal_push_subscriptions
    group by endpoint
    having count(distinct user_id) > 1
  ),
  ua_clusters as (
    select
      coalesce(nullif(trim(s.client_meta->>'ua'), ''), '') as ua,
      count(distinct s.staff_user_id)::integer as account_count,
      array_agg(distinct s.staff_user_id order by s.staff_user_id) as user_ids
    from public.portal_staff_setup_status s
    where coalesce(nullif(trim(s.client_meta->>'ua'), ''), '') <> ''
      and (s.push_enabled or s.location_granted or s.is_pwa or s.portal_features_complete)
    group by coalesce(nullif(trim(s.client_meta->>'ua'), ''), '')
    having count(distinct s.staff_user_id) > 1
  ),
  live as (
    select
      l.staff_user_id,
      max(l.updated_at) as last_gps_at
    from public.portal_staff_live_locations l
    where l.updated_at >= now() - interval '7 days'
    group by l.staff_user_id
  ),
  names as (
    select staff_user_id, staff_display_name from staff
    union
    select
      s.staff_user_id,
      coalesce(nullif(trim(s.staff_display_name), ''), 'Staff') as staff_display_name
    from public.portal_staff_setup_status s
    where not exists (
      select 1 from staff st where st.staff_user_id = s.staff_user_id
    )
  ),
  base as (
    select
      st.staff_user_id,
      st.staff_display_name,
      su.push_enabled,
      su.location_granted,
      su.is_pwa,
      su.last_seen_at,
      su.ua,
      ls.endpoint,
      se.account_count as shared_endpoint_count,
      se.user_ids as shared_endpoint_user_ids,
      uc.account_count as shared_ua_count,
      uc.user_ids as shared_ua_user_ids,
      lv.last_gps_at
    from staff st
    left join setup su on su.staff_user_id = st.staff_user_id
    left join latest_sub ls on ls.staff_user_id = st.staff_user_id
    left join shared_endpoints se on se.endpoint is not distinct from ls.endpoint
    left join ua_clusters uc on uc.ua is not distinct from su.ua and su.ua <> ''
    left join live lv on lv.staff_user_id = st.staff_user_id
  ),
  classified as (
    select
      b.*,
      case
        when coalesce(b.push_enabled, false) = false
          and coalesce(b.location_granted, false) = false
          and coalesce(b.is_pwa, false) = false
          and b.last_seen_at is null
          then 'not_setup'
        when b.shared_endpoint_count is not null and b.shared_endpoint_count > 1 then 'shared_device'
        when b.shared_ua_count is not null and b.shared_ua_count > 1 and b.endpoint is null then 'likely_shared'
        when b.endpoint is not null then 'own_device'
        when b.last_gps_at is not null
          and (b.shared_endpoint_count is null or b.shared_endpoint_count <= 1)
          and (b.shared_ua_count is null or b.shared_ua_count <= 1)
          then 'own_device'
        when coalesce(b.push_enabled, false)
          or coalesce(b.location_granted, false)
          or coalesce(b.is_pwa, false)
          or b.last_seen_at is not null
          then 'unknown'
        else 'not_setup'
      end as attribution
    from base b
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'staff_user_id', c.staff_user_id,
        'attribution', c.attribution,
        'shared_with', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'staff_user_id', n.staff_user_id,
                'staff_display_name', n.staff_display_name
              )
              order by n.staff_display_name
            ),
            '[]'::jsonb
          )
          from names n
          where n.staff_user_id <> c.staff_user_id
            and (
              (c.shared_endpoint_user_ids is not null and n.staff_user_id = any (c.shared_endpoint_user_ids))
              or (
                c.endpoint is null
                and c.shared_ua_user_ids is not null
                and n.staff_user_id = any (c.shared_ua_user_ids)
              )
            )
        ),
        'last_gps_at', c.last_gps_at,
        'has_push', c.endpoint is not null
      )
      order by c.staff_display_name
    ),
    '[]'::jsonb
  )
  from classified c
  where public.portal_staff_profile_is_admin_or_ceo()
     or public.portal_staff_can_view_live_map();
$$;

revoke all on function public.portal_admin_fetch_staff_device_attribution() from public;
grant execute on function public.portal_admin_fetch_staff_device_attribution() to authenticated;

comment on function public.portal_admin_fetch_staff_device_attribution() is
  'Staff Readiness: per active staff, whether portal setup looks like their own device or a phone/browser shared with other accounts.';

commit;
