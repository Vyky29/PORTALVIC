-- Coarse device class for Family portal sessions (phone / desktop / tablet).
alter table public.portal_parent_portal_sessions
  add column if not exists client_device text;
