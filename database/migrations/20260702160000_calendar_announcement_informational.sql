-- Calendar 2026/27: informational only (no signature required).
begin;

update public.portal_staff_announcements
set
  body = E'Term dates and calendar for the 2026/27 academic year.

Open the two tabs — Day Centre (Mon–Fri) and Weekly & Weekend Sessions — to check when you are working.

Download PDF to My Documents is optional whenever you want a copy for your records.',
  on_ack_action = null
where id = 'a0270001-0001-4000-8000-0000000a2701'::uuid;

commit;
