-- Announcement/reminder action: turn on portal features when worker signs (or opens on tap).
begin;

alter table public.portal_staff_announcements
  add column if not exists on_ack_action text null;

alter table public.portal_staff_announcements
  drop constraint if exists portal_staff_announcements_on_ack_action_check;

alter table public.portal_staff_announcements
  add constraint portal_staff_announcements_on_ack_action_check
  check (on_ack_action is null or on_ack_action in ('portal_permissions'));

comment on column public.portal_staff_announcements.on_ack_action is
  'Optional client action after sign/open: portal_permissions runs alerts + camera + location setup.';

-- Seed once (admin can edit/republish from composer). Everyone, high priority announcement.
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
  'Turn on portal features on this device',
  E'Tap Sign below (or open this message from the menu). The portal will ask you to allow notifications and camera — and location if you deliver Bespoke Programme or Day Centre on your rota.\n\nThat lets the office reach you for calls, chat, and the live map during your shift.\n\nMicrophone stays optional: Settings → Advanced settings, for voice feedback only.',
  'announcement',
  'high',
  'all_staff',
  'everyone',
  'portal_permissions'
from auth.users u
where u.id in (select id from public.staff_profiles where lower(coalesce(app_role, '')) in ('admin', 'ceo') limit 1)
  and not exists (
    select 1
    from public.portal_staff_announcements a
    where a.on_ack_action = 'portal_permissions'
      and coalesce(a.ends_at, now() + interval '100 years') > now()
  );

commit;
