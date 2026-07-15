# Parent invoice bank transfer (Tide)

Set these as **Supabase Edge Function secrets** on project `cklpnwhlqsulpmkipmqb`
(Dashboard → Edge Functions → Secrets, or CLI `supabase secrets set`).

Required for parents to see Tide details on unpaid invoices:

```bash
PORTAL_TIDE_PAYEE_NAME="Club SENsational Ltd"   # exact payee name on Tide
PORTAL_TIDE_SORT_CODE="00-00-00"
PORTAL_TIDE_ACCOUNT_NUMBER="12345678"
```

Optional:

```bash
PORTAL_TIDE_REFERENCE_HINT="Use invoice number as reference"
```

If secrets are missing, the parent hub still shows “Contact the office for bank transfer details”
instead of inventing account numbers.

After setting secrets, redeploy (or wait for cold start) of:

- `parent-portal-invoices-list`
- `parent-portal-invoice-report-paid`
- `portal-crash-summer-book` (crash pay screen refs)

## Match Tide CSV (admin)

Finance → **Family invoices** → **Match Tide bank CSV**:

1. In Tide, export inbound payments for the period (CSV with Date, Amount, Description/Reference).
2. Upload in Portal → **Upload & score**.
3. Review suggestions:
   - **strong** — reference contains `INV-P-####` and amount matches (±1p)
   - **medium** — amount matches and name/reference fuzzy-match (review before confirm)
4. **Confirm** marks the invoice `paid` (`paid_via=tide_match`), confirms crash holds if linked, and posts a **Payment** in Xero when `xero_invoice_id` is set.
5. **Ignore** dismisses a noise row.

Idempotent: re-uploading the same Tide rows does not double-pay. This does **not** tick Xero’s bank-feed Reconcile screen — it only writes the accounting Payment so Find & Match is easier.

Deploy:

- `portal-admin-tide-match-upload`
- `portal-admin-tide-match-list`
- `portal-admin-tide-match-confirm`

Or: `node database/local-vault/apply-tide-bank-match.mjs`

Migration: `20260715010000_portal_tide_bank_matches.sql`
