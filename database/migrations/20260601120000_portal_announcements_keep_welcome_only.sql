-- Keep only the production "Welcome to the new Club Sensational portal" announcement.
-- Removes every other (test) announcement so staff (e.g. Roberto) see just the welcome notice.
-- Run in Supabase SQL Editor (Portal project) after prior portal_staff_announcements migrations.

begin;

delete from public.portal_staff_announcements
where message_type = 'announcement'
  and lower(trim(title)) not like 'welcome to the new%portal%';

commit;
