-- Link an anonymous Booking Portal visit to the parent once they request an OTP.

alter table public.portal_booking_service_sessions
  add column if not exists lead_id uuid references public.portal_booking_leads (id) on delete set null,
  add column if not exists parent_name text,
  add column if not exists parent_email text,
  add column if not exists parent_phone text;

comment on column public.portal_booking_service_sessions.lead_id is
  'Set when this visitor requests a booking access code. Before that the row is IP and place only.';

create index if not exists portal_booking_service_sessions_lead_idx
  on public.portal_booking_service_sessions (lead_id)
  where lead_id is not null;
