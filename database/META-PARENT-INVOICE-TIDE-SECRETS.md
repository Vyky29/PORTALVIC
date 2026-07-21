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
PORTAL_TIDE_REFERENCE_HINT="Use participant name as reference"
```

Optional fallback only — the parent pay hub prefers the **participant display name** as the bank reference.

## Invoice Reference vs bank pay reference

| Field | Value |
|---|---|
| PDF / Xero **Reference** (`reference_text`) | Term label, e.g. `Summer term 25/26` |
| Tide / bank pay reference | **Participant name only** |
| Description | Name + service / programme detail |

Crash bookings set term Reference + name bank hint automatically. Tide CSV match scores **strong** on `INV-P-####` still, and **medium** on name / reported pay ref.

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
4. **Confirm** marks the invoice `paid` (`paid_via=tide_match`), confirms crash holds if linked, **creates the Xero ACCREC if missing**, and posts a **Payment** dated to the Tide booking date when Xero is configured.
5. **Ignore** dismisses a noise row.

Idempotent: re-uploading the same Tide rows does not double-pay.

**Bank-feed green tick:** Xero does **not** expose reconcile via API. Confirming here writes books (ACCREC + Payment) so Find & Match / JAX can OK the statement line in Xero; Portal cannot click that tick for you.

Deploy:

- `portal-admin-tide-match-upload`
- `portal-admin-tide-match-list`
- `portal-admin-tide-match-confirm`

Or: `node database/local-vault/apply-tide-bank-match.mjs`

Migration: `20260715010000_portal_tide_bank_matches.sql`
