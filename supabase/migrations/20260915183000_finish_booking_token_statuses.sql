-- Finish-booking token statuses used by portal-booking-finish + post-trial term convert.
-- Original check only had pending/choices_saved/awaiting_payment/la_office/completed/expired,
-- so funding_saved / scope_saved updates failed (silent for some callers) and post-trial
-- links fell back to the original trial registration.

begin;

alter table public.portal_booking_completion_tokens
  drop constraint if exists portal_booking_completion_tokens_status_check;

alter table public.portal_booking_completion_tokens
  add constraint portal_booking_completion_tokens_status_check
  check (
    status in (
      'pending',
      'funding_saved',
      'scope_saved',
      'choices_saved',
      'awaiting_payment',
      'awaiting_office_payment',
      'awaiting_office_referral',
      'la_office',
      'completed',
      'expired'
    )
  );

comment on constraint portal_booking_completion_tokens_status_check on public.portal_booking_completion_tokens is
  'Statuses for multi-step finish-booking + post-trial term convert.';

commit;
