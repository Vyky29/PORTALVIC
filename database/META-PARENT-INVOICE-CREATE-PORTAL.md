# Create family invoices in Portal (path A)

Admin can create a TAX INVOICE without opening Xero:

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

## Later

Batch export / push to Xero for bookkeeping — not required for day-to-day parent billing.
