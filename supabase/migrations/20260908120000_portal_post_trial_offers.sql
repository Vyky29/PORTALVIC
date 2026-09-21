-- Post-trial term offer: after a paid trial, parent gets same-day window to book term
-- (same or other slot) or release. Waves: session-end + 20:00; EOD auto-release + office alert.

create table if not exists public.portal_post_trial_offers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reservation_id uuid not null references public.portal_booking_slot_reservations (id) on delete cascade,
  document_id uuid null,
  participant_name text not null default '',
  parent_name text not null default '',
  parent_phone text not null default '',
  parent_email text not null default '',
  trial_session_date date not null,
  trial_time_label text not null default '',
  trial_venue text not null default '',
  trial_service text not null default '',
  slot_id text not null default '',
  -- Soft hold on the trialled slot so capacity stays blocked until deadline (term choice).
  soft_hold_reservation_id uuid null references public.portal_booking_slot_reservations (id) on delete set null,
  status text not null default 'pending'
    check (status in (
      'pending',
      'term_booked',
      'released_by_parent',
      'released_eod',
      'cancelled'
    )),
  wave1_sent_at timestamptz null,
  wave2_sent_at timestamptz null,
  deadline_at timestamptz not null,
  resolved_at timestamptz null,
  resolve_note text null,
  meta jsonb not null default '{}'::jsonb
);

create unique index if not exists portal_post_trial_offers_reservation_uidx
  on public.portal_post_trial_offers (reservation_id);

create index if not exists portal_post_trial_offers_status_deadline_idx
  on public.portal_post_trial_offers (status, deadline_at);

create index if not exists portal_post_trial_offers_session_date_idx
  on public.portal_post_trial_offers (trial_session_date);

alter table public.portal_post_trial_offers enable row level security;

revoke all on public.portal_post_trial_offers from public, anon, authenticated;
grant select, insert, update, delete on public.portal_post_trial_offers to service_role;

comment on table public.portal_post_trial_offers is
  'Paid trial → same-day term book-or-release offer (wave after session + 20:00; EOD release).';
