-- Pool-issue WhatsApp ledger. Hub room never uses this table.
-- Service role only. The phone number stays in an Edge secret, not here.

begin;

create table if not exists public.venue_review_pilar_send (
  venue_review_id uuid primary key references public.venue_reviews (id) on delete cascade,
  status text not null default 'pending',
  error text null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  constraint venue_review_pilar_send_status_check check (status in ('pending', 'sent', 'failed'))
);

alter table public.venue_review_pilar_send enable row level security;

grant select, insert, update on table public.venue_review_pilar_send to service_role;

commit;
