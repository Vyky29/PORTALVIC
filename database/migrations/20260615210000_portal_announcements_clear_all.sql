-- Clear all staff announcements/reminders and signatures (clean slate for signed log).
-- Portal project cklpnwhlqsulpmkipmqb.

begin;

delete from public.portal_staff_announcement_acks;
delete from public.portal_staff_announcements;

commit;
