-- Day Centre Calendar 2026/27: all-staff announcement; on sign → PDF saved in My Documents (browser).
begin;

alter table public.portal_staff_announcements
  drop constraint if exists portal_staff_announcements_on_ack_action_check;

alter table public.portal_staff_announcements
  add constraint portal_staff_announcements_on_ack_action_check
  check (on_ack_action is null or on_ack_action in (
    'portal_permissions',
    'annual_profile',
    'calendar_2026_27'
  ));

comment on column public.portal_staff_announcements.on_ack_action is
  'Optional post-ack hook: portal_permissions | annual_profile | calendar_2026_27 (PDF to My Documents on sign).';

insert into public.portal_staff_announcements (
  id,
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
  'a0270001-0001-4000-8000-0000000a2701'::uuid,
  u.id,
  'Day Centre Calendar 2026/27',
  E'Please read the Day Centre term dates and calendar for the 2026/27 academic year below.

When you sign below, a PDF copy titled "Calendar 2026/27" will be saved automatically in your My Documents folder for future reference.

These dates will also be used when we ask about your shift preferences for next year.',
  'announcement',
  'high',
  'all_staff',
  'everyone',
  'calendar_2026_27'
from auth.users u
where u.id in (
  select id from public.staff_profiles
  where lower(coalesce(app_role, '')) in ('admin', 'ceo')
  limit 1
)
on conflict (id) do update set
  title = excluded.title,
  body = excluded.body,
  message_type = excluded.message_type,
  priority = excluded.priority,
  audience_scope = excluded.audience_scope,
  delivery_scope = excluded.delivery_scope,
  on_ack_action = excluded.on_ack_action;

commit;
