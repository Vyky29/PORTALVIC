-- Booking Portal waitlist joins (capacity-full slots).
-- Companion: supabase/migrations/20260813160000_portal_waitlist_entries.sql

begin;

create table if not exists public.portal_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.portal_booking_leads (id) on delete set null,
  participant_name text not null,
  parent_name text not null default '',
  email text not null default '',
  mobile text not null default '',
  service_key text not null default '',
  service_label text not null default '',
  venue text not null default '',
  day_name text not null default '',
  time_label text not null default '',
  slot_id text not null,
  note text,
  source text not null default 'booking_portal',
  status text not null default 'active'
    check (status in ('active', 'offered', 'placed', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_waitlist_entries_created_idx
  on public.portal_waitlist_entries (created_at desc);

create index if not exists portal_waitlist_entries_status_idx
  on public.portal_waitlist_entries (status, created_at desc);

create index if not exists portal_waitlist_entries_slot_idx
  on public.portal_waitlist_entries (slot_id, created_at desc);

create index if not exists portal_waitlist_entries_lead_idx
  on public.portal_waitlist_entries (lead_id)
  where lead_id is not null;

-- Soft unique: one active join per email + slot.
create unique index if not exists portal_waitlist_entries_active_email_slot_uidx
  on public.portal_waitlist_entries (lower(trim(email)), slot_id)
  where status = 'active' and nullif(trim(email), '') is not null;

comment on table public.portal_waitlist_entries is
  'Waiting-list joins from Booking Portal when a bookable slot is full.';

alter table public.portal_waitlist_entries enable row level security;

revoke all on table public.portal_waitlist_entries from public, anon, authenticated;
grant all on table public.portal_waitlist_entries to service_role;

commit;
