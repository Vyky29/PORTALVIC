-- Mirror of database/migrations/20260610210000_portal_announcements_live_from_jun2.sql

begin;

delete from public.portal_staff_announcement_acks
where lower(trim(coalesce(staff_full_name, ''))) like '%javier marquez%'
   or lower(trim(coalesce(staff_username, ''))) in ('javier', 'javier marquez');

delete from public.portal_staff_announcement_acks ack
using public.portal_staff_announcements a
where ack.announcement_id = a.id
  and a.message_type = 'announcement'
  and a.created_at < timestamptz '2026-06-02 00:00:00+00';

delete from public.portal_staff_announcements a
where a.message_type = 'announcement'
  and a.created_at < timestamptz '2026-06-02 00:00:00+00';

commit;
