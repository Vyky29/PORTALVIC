# Create family invoices in Portal (path A)

**One admin surface:** Finance → **Family invoices** (`reenrol_payments`).
Legacy **Xero / finance** (CSV draft builder) redirects here — day-to-day parent billing does not use that screen.

Tide bank details and Stripe Checkout are **not** admin screens: secrets + Edge Functions + parent hub + webhooks. Admins create/share invoices and mark paid / confirm paid here.

1. Admin → Family invoices → **Create invoice in Portal**
2. Pick participant, VAT mode (**Private · 20%** or **LA/NHS · Exempt**), amount, due date, description
3. **Create & share** → Portal allocates `INV-P-####`, generates PDF (Xero-like), shares to parent hub

Parents pay as today (Tide / Card / Apple Pay / credit).

Optional: still upload a Xero PDF under “Or upload a Xero / office PDF” if needed.

## Numbering

Series `INV-P-0001`… via `portal_allocate_invoice_number` (table `portal_invoice_number_seq`).
Separate from Xero `INV-####` so both can coexist.

## Templates

- Exempt ≈ INV-0270 layout
- VAT 20% ≈ INV-0353 layout (amount entered is **gross** incl. VAT)

## Auto from re-enrolment

On **first** re-enrolment submit (parent-pays plans only), Portal creates the INV-P instalment schedule from the chosen payment plan (same dates/amounts as the parent preview). Funder-invoice families are skipped. Resubmits do not create duplicates — office adjusts in Family invoices.

`created_via = reenrolment` on those share rows.

## Later

Xero sales account code can be overridden with `XERO_SALES_ACCOUNT_CODE` (default `200`).
Re-consent OAuth with `accounting.invoices` + `accounting.contacts` if push returns auth errors.
