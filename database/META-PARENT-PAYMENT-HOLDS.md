# Family payment holds (own arrangement / overdue)

Pressure flow used when families do not keep the prepaid buffer (or stay unpaid after reminders):

1. **Soft hold** — badge on Family invoices; reminders logged (`Remind`)
2. **Hold 1 session** — cancels the next upcoming session via `schedule_overrides` (`recoverable: true`)
3. **Pay to unlock** — Stripe checkout, credit apply, or admin **Mark paid** clears the hold and restores the held session
4. **Hard cut** — admin-only (`hard_cut` action); does not auto-restore; move to standard plan / pause manually

## Prepaid buffer (own arrangement)

Required buffer comes from the latest re-enrolment submit (`advance_buffer_gbp` = 2 sessions × each kept service).

**v1 available balance (proxy):**

```
available = open family credits − overdue unpaid/partial invoices (due_date < today)
shortfall = max(0, required − available)
```

Session-consumption accounting (true “2 sessions ahead”) is a later refinement.

**Nightly cron** (`portal-cron-own-arrangement-buffer-check`, ~06:00 London):

- shortfall → auto **soft_hold** (never auto hold_session / hard_cut)
- buffer restored + open soft_hold only → auto clear (`cleared_via: buffer_restored`)
- if status is already `session_held`, cron leaves it for admin

Family invoices shows **Buffer low** chips + filter.

## Admin UI

Finance → **Family invoices** row actions: Soft hold · Remind · Hold 1 session · Release hold.

## Tables / functions

- `portal_family_payment_holds`
- `portal-admin-payment-hold-action`
- `portal-cron-own-arrangement-buffer-check`
- Clear hooks: `parent-portal-stripe-webhook`, `portal-admin-parent-invoices-upsert`, `parent-portal-credit-apply-invoice`
