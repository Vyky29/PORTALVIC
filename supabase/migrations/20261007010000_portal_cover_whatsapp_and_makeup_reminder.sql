-- Cover WhatsApp: one assigned and one removed per worker, so undoing the override can text again.
-- Makeup reminder: one parent WhatsApp the morning before, only while the offer is still pending.

create table if not exists public.portal_cover_whatsapp_sent (
  override_id uuid not null references public.schedule_overrides (id) on delete cascade,
  event text not null,
  sent_at timestamptz not null default now(),
  primary key (override_id, event)
);

comment on table public.portal_cover_whatsapp_sent is
  'Cover WhatsApp ledger. event is assigned:<staff>, removed:<staff>, or push_removed.';

alter table public.portal_cover_whatsapp_sent enable row level security;
revoke all on public.portal_cover_whatsapp_sent from public, anon, authenticated;
grant select, insert, delete on public.portal_cover_whatsapp_sent to service_role;

alter table public.portal_parent_makeup_offers
  add column if not exists reminder_sent_at timestamptz null;

comment on column public.portal_parent_makeup_offers.reminder_sent_at is
  'Set when the day-before Accept/Decline WhatsApp was sent. One reminder only.';
