-- Finish-booking bank/GC pay window uses status awaiting_payment on slot holds.
-- Original check only allowed pending | validated | released | expired.

alter table public.portal_booking_slot_reservations
  drop constraint if exists portal_booking_slot_reservations_status_check;

alter table public.portal_booking_slot_reservations
  add constraint portal_booking_slot_reservations_status_check
  check (status in ('pending', 'validated', 'released', 'expired', 'awaiting_payment'));

create index if not exists portal_booking_slot_reservations_awaiting_pay_idx
  on public.portal_booking_slot_reservations (hold_expires_at)
  where status = 'awaiting_payment';
