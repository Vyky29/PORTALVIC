-- Announcements go-live 2026-06-02: remove pre-launch rows and Javier Marquez test signature.

begin;

-- Remove test signature (CEO account used while testing).
delete from public.portal_staff_announcement_acks
where lower(trim(coalesce(staff_full_name, ''))) like '%javier marquez%'
   or lower(trim(coalesce(staff_username, ''))) in ('javier', 'javier marquez');

-- Drop acks tied to announcements published before go-live.
delete from public.portal_staff_announcement_acks ack
using public.portal_staff_announcements a
where ack.announcement_id = a.id
  and a.message_type = 'announcement'
  and a.created_at < timestamptz '2026-06-02 00:00:00+00';

-- Remove pre-launch announcement posts (keep production notice from 2 Jun onward).
delete from public.portal_staff_announcements a
where a.message_type = 'announcement'
  and a.created_at < timestamptz '2026-06-02 00:00:00+00';

commit;
