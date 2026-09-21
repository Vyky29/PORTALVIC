-- Allow Stripe trial finish-booking pay_plan on completion tokens.
-- Without this, create_invoice updates with pay_plan=stripe_instant fail the whole
-- row patch (including invoice_share_id), so Stripe webhooks cannot find the token.

alter table public.portal_booking_completion_tokens
  drop constraint if exists portal_booking_completion_tokens_pay_plan_check;

alter table public.portal_booking_completion_tokens
  add constraint portal_booking_completion_tokens_pay_plan_check
  check (
    pay_plan is null
    or pay_plan in (
      'gocardless_monthly',
      'flexi_bank',
      'one_off_bank',
      'own_way',
      'stripe_instant'
    )
  );
