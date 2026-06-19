-- Remove teflon push QA announcements; keep the latest test row only.
-- Run in Supabase SQL Editor (Portal project cklpnwhlqsulpmkipmqb).

begin;

with teflon as (
  select id as user_id
  from public.staff_profiles
  where lower(username) = 'teflon'
  limit 1
),
keep_one as (
  select a.id
  from public.portal_staff_announcements a
  cross join teflon t
  where a.target_user_id = t.user_id
    and a.delivery_scope = 'single_user'
  order by a.created_at desc
  limit 1
)
delete from public.portal_staff_announcement_acks ack
using public.portal_staff_announcements a
cross join teflon t
where ack.announcement_id = a.id
  and a.target_user_id = t.user_id
  and a.delivery_scope = 'single_user'
  and a.id not in (select id from keep_one);

with teflon as (
  select id as user_id
  from public.staff_profiles
  where lower(username) = 'teflon'
  limit 1
),
keep_one as (
  select a.id
  from public.portal_staff_announcements a
  cross join teflon t
  where a.target_user_id = t.user_id
    and a.delivery_scope = 'single_user'
  order by a.created_at desc
  limit 1
)
delete from public.portal_staff_announcements a
using teflon t
where a.target_user_id = t.user_id
  and a.delivery_scope = 'single_user'
  and a.id not in (select id from keep_one);

commit;
