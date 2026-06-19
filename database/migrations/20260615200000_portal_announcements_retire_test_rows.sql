-- Retire test / launch announcements so they stop appearing in staff signed logs and push.
-- Run in Supabase SQL Editor (Portal project cklpnwhlqsulpmkipmqb).

begin;

delete from public.portal_staff_announcement_acks ack
using public.portal_staff_announcements a
where ack.announcement_id = a.id
  and a.message_type = 'announcement'
  and (
    lower(trim(a.title)) in (
      'no abodi today',
      'clubsensational portal is ready',
      'turn on portal features on this device',
      'club sensational portal is ready'
    )
    or lower(trim(a.title)) like 'welcome to the new%portal%'
    or lower(trim(a.title)) like 'turn on portal features%'
  );

delete from public.portal_staff_announcements
where message_type = 'announcement'
  and (
    lower(trim(title)) in (
      'no abodi today',
      'clubsensational portal is ready',
      'turn on portal features on this device',
      'club sensational portal is ready'
    )
    or lower(trim(title)) like 'welcome to the new%portal%'
    or lower(trim(title)) like 'turn on portal features%'
  );

commit;
