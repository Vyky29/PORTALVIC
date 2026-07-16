-- CEO Booking Portal presence: store plaintext client IP (admin-only via Edge Function).
alter table public.portal_booking_service_sessions
  add column if not exists client_ip text null;

comment on column public.portal_booking_service_sessions.client_ip is
  'Visitor connection IP for CEO presence matching; never exposed to anon clients.';
