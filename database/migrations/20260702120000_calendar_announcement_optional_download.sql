-- Calendar 2026/27 announcement: HTML in modal; PDF optional via download button (not on sign).
begin;

comment on column public.portal_staff_announcements.on_ack_action is
  'Optional post-ack hook: portal_permissions | annual_profile | calendar_2026_27 (calendar type marker; PDF is optional download).';

update public.portal_staff_announcements
set body = E'Please review the Day Centre term dates and calendar for the 2026/27 academic year below.

Scroll through the calendar, then tick the box and sign to confirm you have read it.

If you want a copy for your records, use Download PDF to My Documents — this is optional and does not block signing.

These dates will also be used when we ask about your shift preferences for next year.'
where id = 'a0270001-0001-4000-8000-0000000a2701'::uuid;

commit;
