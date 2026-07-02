-- Mirror of database/migrations/20260702140000_calendar_announcement_v2_body.sql
begin;

update public.portal_staff_announcements
set body = E'Updated calendar — please review both tabs below.

Day Centre (Mon–Fri): term dates and when the Day Centre is open.

Weekly & Weekend Sessions: aquatic, climbing, multi-activity and other programmes (includes weekends when sessions run).

Scroll through the calendar, tick the box and sign to confirm you have read the updated version.

Download PDF to My Documents is optional.'
where id = 'a0270001-0001-4000-8000-0000000a2701'::uuid;

commit;
