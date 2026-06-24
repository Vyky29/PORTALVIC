-- Diagnose teflon + insert single-user test announcement (push test).

-- 1) profile
select 'profile' as step, id, username, full_name, app_role, staff_role
from public.staff_profiles
where lower(username) = 'teflon'
   or full_name ilike '%teflon%';

-- 2) push subs
select 'push_subs' as step, ps.user_id, left(ps.endpoint, 80) as endpoint_prefix, ps.created_at, ps.updated_at
from public.portal_push_subscriptions ps
join public.staff_profiles sp on sp.id = ps.user_id
where lower(sp.username) = 'teflon';

-- 3) insert test announcement
with teflon as (
  select id as user_id
  from public.staff_profiles
  where lower(username) = 'teflon'
  limit 1
),
admin as (
  select id as user_id
  from public.staff_profiles
  where app_role in ('admin', 'ceo')
  order by case when app_role = 'admin' then 0 else 1 end
  limit 1
)
insert into public.portal_staff_announcements (
  created_by,
  title,
  body,
  message_type,
  priority,
  audience_scope,
  delivery_scope,
  target_user_id,
  ends_at
)
select
  admin.user_id,
  'Push test — teflon only',
  'Prueba de notificación push solo para teflon. Si ves esto, el push funciona.',
  'announcement',
  'high',
  'all_staff',
  'single_user',
  teflon.user_id,
  now() + interval '2 hours'
from teflon, admin
returning id, title, target_user_id, created_at;

-- 4) dedupe ledger
select 'dedupe' as step, was.announcement_id, was.sent_at, a.title
from public.portal_webpush_announcement_sent was
join public.portal_staff_announcements a on a.id = was.announcement_id
join public.staff_profiles sp on sp.id = a.target_user_id
where lower(sp.username) = 'teflon'
order by was.sent_at desc
limit 3;
