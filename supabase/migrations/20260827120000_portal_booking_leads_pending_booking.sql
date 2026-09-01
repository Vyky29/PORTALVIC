-- Persist slot picked on Booking Portal until registration + invoice (survives lost URL params).

begin;

alter table public.portal_booking_leads
  add column if not exists pending_booking_request jsonb;

comment on column public.portal_booking_leads.pending_booking_request is
  'Last slot the lead chose on /bookingportal (service, venue, day, time, slot_id, trial|term). Cleared after registration hold is created.';

create index if not exists portal_booking_leads_pending_booking_idx
  on public.portal_booking_leads ((pending_booking_request->>'slot_id'))
  where pending_booking_request is not null;

commit;
