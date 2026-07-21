# Parent invoices → Xero

Portal INV-Ps are the day-to-day source of truth. Xero is for bookkeeping
and bank reconciliation.

## Batch push (API)

Finance → **Family invoices** → **Push to Xero** creates ACCREC invoices in Xero for
Portal-created rows (`created_via` portal/reenrolment) that do not yet have
`xero_invoice_id`. On success the share row is stamped with the Xero InvoiceID.
Invoices are left **awaiting payment** in Xero (no Payment write-back).

Also available: **Export to Xero CSV** as a manual import fallback.

Paid paths (Stripe, GoCardless, admin Confirm paid, Tide Confirm) call
**`xeroEnsurePaidShareInBooks`**: create ACCREC if missing, left **awaiting payment**.
Staff mark Paid and reconcile the bank line in Xero. The batch button remains for
backlog retries and rows that failed earlier.

## Payment write-back

Portal does **not** post Xero Payments on paid anymore (Finance preference:
invoice in books → mark Paid + reconcile in Xero). `xeroSyncPaidInvoiceShare`
remains in code for rare one-off scripts only.

## Bank-feed green tick (Reconcile)

**Xero does not allow reconciling bank statement lines via the public API**
(documented: Accounting API → Bank Statements → “Reconcile via the API”).
Portal creates the ACCREC (awaiting payment); staff mark Paid and tick OK in Xero.

## Secrets (Supabase Edge Functions)

```bash
XERO_CLIENT_ID="..."
XERO_CLIENT_SECRET="..."
XERO_REFRESH_TOKEN="..."   # from Xero OAuth consent; rotates — update when Xero issues a new one
XERO_TENANT_ID="..."       # organisation connection id
XERO_BANK_ACCOUNT_CODE="090"  # optional legacy; bank feeds often have no Code
XERO_BANK_ACCOUNT_ID="…"      # preferred — Xero AccountID GUID for Tide/Revolut GBP bank
XERO_SALES_ACCOUNT_CODE="200"          # legacy alias for taxable (optional)
XERO_SALES_ACCOUNT_CODE_VAT="200"      # Sales Structured Support (Taxable 20%)
XERO_SALES_ACCOUNT_CODE_EXEMPT="202"   # Sales Structured Support Activity (VAT Exempt)
XERO_TAX_TYPE_VAT="OUTPUT2"            # 20% (VAT on Income)
XERO_TAX_TYPE_EXEMPT="EXEMPTOUTPUT"    # Exempt Income
```

Defaults if unset: taxable → account **200** + tax **OUTPUT2**; exempt → account **202** + tax **EXEMPTOUTPUT**.

Create a Xero **Web app** (OAuth2). Apps created on/after **2 March 2026** must use
**granular** scopes (broad `accounting.transactions` is rejected).

Required scopes for push + payment write-back:

```
openid profile email offline_access accounting.payments accounting.invoices accounting.contacts
```

There is **no** authorize URL builder in this repo (no NextAuth / no Edge Function
callback). First consent is a one-off browser URL, then store `refresh_token` +
`tenantId` in secrets. Redirect URI used for that one-off:

```
http://localhost:8787/xero-callback
```

Authorize (replace `YOUR_CLIENT_ID`):

```
https://login.xero.com/identity/connect/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fxero-callback&scope=openid%20profile%20email%20offline_access%20accounting.payments%20accounting.invoices%20accounting.contacts&state=portal
```

After the first refresh, if logs warn about a new refresh token, update
`XERO_REFRESH_TOKEN` in secrets.

## Re-consent (needed for Push to Xero)

Current payment-only tokens lack `accounting.invoices` / `accounting.contacts`.
Run locally (redirect URI `http://localhost:8787/xero-callback` must be on the Xero app):

```bash
node database/local-vault/xero-reconsent.mjs
```

Authorize in the browser, then run the printed `npx supabase secrets set …` command.

## Admin usage

- Prefer **Push to Xero** for Portal-generated invoices (or rely on auto-ensure on pay).
- For uploaded Xero PDFs, paste the Xero **InvoiceID** (GUID) so payment write-back works.
- Contact mapping is stored on `portal_parent_contacts.xero_contact_id`.

## Redeploy after setting secrets / scopes

- `portal-admin-xero-batch-push`
- `portal-admin-tide-match-confirm`
- `portal-admin-parent-invoices-upsert`
- `parent-portal-stripe-webhook`
- `parent-portal-gocardless-webhook`
- `parent-portal-credit-apply-invoice`

If secrets are missing, payments still work in the portal; Xero is simply skipped.
