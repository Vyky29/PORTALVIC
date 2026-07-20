# LA / Commissioning Terms & Conditions

Isolated from family parent T&Cs (`working_ui/terms_and_conditions.html` → `/parent/terms`) and re-enrolment `declarations.terms`.

## Public pages

- `/commissioning/terms` → `working_ui/la_commissioning_terms_and_conditions.html` (v1.0)
- `/commissioning/terms-accept?token=…` → `working_ui/commissioning_terms_accept.html`

## Admin

Finance → **LA / Commissioning Terms** (`admin-commissioning-terms.js`).

## Edge Functions

- `commissioning-terms-accept` — public token view/accept
- `commissioning-terms-admin` — admin JWT: orgs, send link, placements, POs, overrides

## DB (migration `20260720120000_portal_commissioning_terms.sql`)

- `portal_terms_documents` / `portal_terms_send_events` / `portal_terms_acceptances`
- `portal_commissioning_orgs` / `portal_commissioning_placements` / `portal_purchase_orders`
- `portal_commissioning_director_overrides` / `portal_commissioning_finance_settings`

Feature flags (defaults): `commissioning_terms_enabled=true`, `commissioning_attendance_hard_block=false`.

## Smoke

```bash
node database/local-vault/smoke-commissioning-terms.mjs
```
