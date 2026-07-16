-- Soft holds for Booking Service → registration form (new clients).
-- Pending rows reduce public offer seats until admin validates / expires / releases.

create table if not exists public.portal_booking_slot_reservations (
  id uuid primary key default gen_random_uuid(),
  slot_id text not null,
  service_id text null,
  service_name text null,
  venue text null,
  day_label text null,
  time_label text null,
  activity text null,
  booking_mode text null,
  week_id text null,
  block_id text null,
  date_iso date null,
  document_id uuid null references public.portal_participant_documents (id) on delete set null,
  participant_name text null,
  parent_name text null,
  parent_email text null,
  parent_phone text null,
  booking_session_token_hash text null,
  status text not null default 'pending'
    check (status in ('pending', 'validated', 'released', 'expired')),
  hold_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_at timestamptz null,
  released_at timestamptz null,
  notes text null
);

create index if not exists portal_booking_slot_reservations_slot_pending_idx
  on public.portal_booking_slot_reservations (slot_id)
  where status = 'pending';

create index if not exists portal_booking_slot_reservations_expires_idx
  on public.portal_booking_slot_reservations (hold_expires_at)
  where status = 'pending';

create index if not exists portal_booking_slot_reservations_document_idx
  on public.portal_booking_slot_reservations (document_id);

create index if not exists portal_booking_slot_reservations_email_idx
  on public.portal_booking_slot_reservations (lower(parent_email))
  where parent_email is not null;

alter table public.portal_booking_slot_reservations enable row level security;

revoke all on table public.portal_booking_slot_reservations from public, anon, authenticated;
grant all on table public.portal_booking_slot_reservations to service_role;
