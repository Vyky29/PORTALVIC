-- Finish-booking tokens: after admin Accepts a registration, parent returns via magic link
-- to choose funding / pay method and pay the first instalment.

begin;

create table if not exists public.portal_booking_completion_tokens (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null references public.portal_booking_leads (id) on delete set null,
  document_id uuid null references public.portal_participant_documents (id) on delete set null,
  reservation_id uuid null references public.portal_booking_slot_reservations (id) on delete set null,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  funding_code text null
    check (funding_code is null or funding_code in ('privately_funded', 'la_direct_payments')),
  pay_plan text null
    check (
      pay_plan is null
      or pay_plan in ('gocardless_monthly', 'flexi_bank', 'one_off_bank')
    ),
  choices_json jsonb not null default '{}'::jsonb,
  contact_id text null,
  parent_person_id text null,
  invoice_share_id uuid null,
  finish_link_sent_at timestamptz null,
  pin_sent_at timestamptz null,
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'choices_saved',
        'awaiting_payment',
        'la_office',
        'completed',
        'expired'
      )
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists portal_booking_completion_tokens_hash_uidx
  on public.portal_booking_completion_tokens (token_hash);

create index if not exists portal_booking_completion_tokens_document_idx
  on public.portal_booking_completion_tokens (document_id);

create index if not exists portal_booking_completion_tokens_invoice_idx
  on public.portal_booking_completion_tokens (invoice_share_id)
  where invoice_share_id is not null;

create index if not exists portal_booking_completion_tokens_lead_idx
  on public.portal_booking_completion_tokens (lead_id)
  where lead_id is not null;

alter table public.portal_booking_completion_tokens enable row level security;

revoke all on table public.portal_booking_completion_tokens from public, anon, authenticated;
grant all on table public.portal_booking_completion_tokens to service_role;

comment on table public.portal_booking_completion_tokens is
  'Magic-link tokens so accepted Booking Portal parents can finish funding, payment, and unlock Parent Portal PIN.';

commit;
