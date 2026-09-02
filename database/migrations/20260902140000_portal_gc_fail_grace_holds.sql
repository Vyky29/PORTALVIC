-- GoCardless failed instalment → 2h bank-transfer grace on family payment holds.

begin;

alter table public.portal_family_payment_holds
  drop constraint if exists portal_family_payment_holds_reason_check;

alter table public.portal_family_payment_holds
  add constraint portal_family_payment_holds_reason_check
  check (
    reason in (
      'own_arrangement_buffer',
      'invoice_overdue',
      'manual',
      'gocardless_failed'
    )
  );

alter table public.portal_family_payment_holds
  add column if not exists grace_deadline_at timestamptz null;

alter table public.portal_family_payment_holds
  add column if not exists gocardless_payment_id text null;

alter table public.portal_family_payment_holds
  add column if not exists amount_gbp numeric(12, 2) null;

alter table public.portal_family_payment_holds
  add column if not exists whatsapp_sent_at timestamptz null;

alter table public.portal_family_payment_holds
  add column if not exists held_client_name text null;

create index if not exists portal_family_payment_holds_gc_grace_idx
  on public.portal_family_payment_holds (status, reason, grace_deadline_at)
  where reason = 'gocardless_failed' and status = 'soft_hold';

comment on column public.portal_family_payment_holds.grace_deadline_at is
  'GC fail: bank-transfer window end (typically whatsapp_sent_at + 2 hours).';
comment on column public.portal_family_payment_holds.gocardless_payment_id is
  'Failed GoCardless payment id that opened this grace hold.';
comment on column public.portal_family_payment_holds.held_client_name is
  'Client name on MADRE before HOLD WAITLIST escalation (for restore on pay).';

commit;
