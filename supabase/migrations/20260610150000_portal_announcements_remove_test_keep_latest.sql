-- Remove test / superseded staff announcements. Keep one production notice only.
-- Prefers "ClubSENsational Portal is ready" (newest row if duplicated); else newest announcement.

begin;

with portal_ready as (
  select id
  from public.portal_staff_announcements
  where message_type = 'announcement'
    and lower(trim(title)) = lower('ClubSENsational Portal is ready')
  order by created_at desc nulls last, id desc
  limit 1
),
fallback_latest as (
  select id
  from public.portal_staff_announcements
  where message_type = 'announcement'
  order by created_at desc nulls last, id desc
  limit 1
),
keep as (
  select coalesce(
    (select id from portal_ready),
    (select id from fallback_latest)
  ) as keep_id
)
delete from public.portal_staff_announcements a
where a.message_type = 'announcement'
  and exists (select 1 from keep k where k.keep_id is not null)
  and a.id <> (select keep_id from keep);

with admin_user as (
  select sp.id
  from public.staff_profiles sp
  where sp.id is not null
    and sp.is_active is distinct from false
    and (
      sp.app_role in ('admin', 'ceo')
      or lower(coalesce(sp.username, '')) in ('victor', 'javi', 'raul', 'sevitha')
    )
  order by
    case when sp.app_role = 'ceo' then 0 when sp.app_role = 'admin' then 1 else 2 end,
    sp.created_at nulls last
  limit 1
),
portal_ready as (
  select
    'ClubSENsational Portal is ready' as title,
    'ClubSENsational Portal is now live for your day-to-day work.

Please read this notice carefully, then sign below to confirm you have understood it.

FIND THE GUIDE
Tap the club logo in the dashboard header (top of the screen). That opens Alerts and Notifications, where you will find the step-by-step Portal Guide — how to use today''s sessions, feedback, venue checks, timesheets, and more.

REPORT A PROBLEM
If you notice anything wrong — missing sessions, feedback not saving, timesheet issues, or anything else — contact an admin immediately so we can fix it.

Thank you for helping us run a smooth rollout.' as body
)
insert into public.portal_staff_announcements (
  created_by,
  title,
  body,
  message_type,
  priority,
  audience_scope,
  delivery_scope
)
select u.id, p.title, p.body, 'announcement', 'high', 'all_staff', 'everyone'
from admin_user u
cross join portal_ready p
where not exists (
  select 1
  from public.portal_staff_announcements a
  where a.message_type = 'announcement'
);

commit;
