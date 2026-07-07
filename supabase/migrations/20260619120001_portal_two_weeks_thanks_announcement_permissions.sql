-- Wipe all staff announcements/reminders + signatures; publish single thank-you notice
-- with silent portal_permissions on open/sign (no permission copy in body).
begin;

delete from public.portal_staff_announcement_acks;

delete from public.portal_staff_announcements;

insert into public.portal_staff_announcements (
  created_by,
  title,
  body,
  message_type,
  priority,
  audience_scope,
  delivery_scope,
  on_ack_action
)
select
  u.id,
  'Two weeks on the Portal — thank you',
  E'We have now been using ClubSENsational Portal for two weeks, and it is working better every day.

Thank you for your support — for reporting problems, giving us time to fix them, and for your patience while we keep improving things together.

Please read this message, then sign below to confirm you have seen it.',
  'announcement',
  'high',
  'all_staff',
  'everyone',
  'portal_permissions'
from auth.users u
where u.id in (
  select id
  from public.staff_profiles
  where lower(coalesce(app_role, '')) in ('admin', 'ceo')
  limit 1
);

commit;
