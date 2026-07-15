-- Coarse device class for Family portal sessions (phone / desktop / tablet).
alter table public.portal_parent_portal_sessions
  add column if not exists client_device text;

comment on column public.portal_parent_portal_sessions.client_device is
  'phone | desktop | tablet — from User-Agent at sign-in / ping; no raw UA stored.';
