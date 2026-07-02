-- Annual profile check-in (2026): all-staff announcement + on_ack_action annual_profile.
-- Workers complete staff_profile_update.html; announcement hides when profile_last_confirmed_at >= 2026-01-01.

begin;

alter table public.portal_staff_announcements
  drop constraint if exists portal_staff_announcements_on_ack_action_check;

alter table public.portal_staff_announcements
  add constraint portal_staff_announcements_on_ack_action_check
  check (on_ack_action is null or on_ack_action in ('portal_permissions', 'annual_profile'));

comment on column public.portal_staff_announcements.on_ack_action is
  'Optional post-ack hook: portal_permissions | annual_profile (cleared when staff confirms annual profile).';

-- Fixed id so the portal can auto-ack after staff_profile_update save.
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
  'a0260001-0001-4000-8000-0000000a2601'::uuid,
  u.id,
  'Annual profile check-in — please update your details',
  E'Before the new academic year, we need every team member to confirm their contact details on file.

Please open the annual profile form from the button below (you are already signed in to the portal). Check your home address, your mobile number, emergency contact, and tell us whether you want the same shifts as last year or something different.

The notice will disappear from your dashboard once you submit the form.',
  'announcement',
  'high',
  'all_staff',
  'everyone',
  'annual_profile'
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
