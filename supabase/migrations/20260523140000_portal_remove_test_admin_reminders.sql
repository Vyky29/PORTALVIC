-- Remove admin test reminders/announcements published while testing the composer.
-- Run in Supabase SQL Editor (Portal project).

begin;

delete from public.portal_staff_announcements
where message_type = 'reminder'
  and (
    lower(trim(title)) like 'comprobando que va%'
    or lower(trim(title)) like 'comprobando%'
    or lower(trim(body)) like '%hola roberto%'
  );

-- Optional: other obvious test reminder titles from admin QA (safe partial match).
delete from public.portal_staff_announcements
where message_type = 'reminder'
  and (
    lower(trim(title)) in ('test', 'prueba', 'prueba reminder')
    or lower(trim(title)) like 'test %'
    or lower(trim(title)) like 'prueba %'
  );

commit;
