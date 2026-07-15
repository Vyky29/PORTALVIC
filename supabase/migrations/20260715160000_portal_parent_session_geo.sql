-- Coarse connection geo for Family portal sessions (no raw IP stored).
alter table public.portal_parent_portal_sessions
  add column if not exists geo_country text,
  add column if not exists geo_region text,
  add column if not exists geo_city text,
  add column if not exists geo_bucket text,
  add column if not exists geo_lat double precision,
  add column if not exists geo_lng double precision,
  add column if not exists geo_label text;
