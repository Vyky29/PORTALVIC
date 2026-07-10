# Family payment holds (own arrangement / overdue)

Pressure flow used when families do not keep the prepaid buffer (or stay unpaid after reminders):

1. **Soft hold** — badge on Family invoices; reminders logged (`Remind`)
2. **Hold 1 session** — cancels the next upcoming session via `schedule_overrides` (`recoverable: true`)
3. **Pay to unlock** — Stripe checkout or admin **Mark paid** clears the hold and restores the held session
4. **Hard cut** — admin-only (`hard_cut` action); does not auto-restore; move to standard plan / pause manually

## Admin UI

Finance → **Family invoices** row actions: Soft hold · Remind · Hold 1 session · Release hold.

## Tables / functions

- `portal_family_payment_holds`
- `portal-admin-payment-hold-action`
- Clear hooks: `parent-portal-stripe-webhook`, `portal-admin-parent-invoices-upsert`
