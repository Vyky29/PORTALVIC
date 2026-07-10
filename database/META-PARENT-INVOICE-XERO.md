# Parent invoices → Xero

Portal INV-P invoices are the day-to-day source of truth. Xero is for bookkeeping
and bank reconciliation.

## Batch push (API)

Finance → **Family invoices** → **Push to Xero** creates ACCREC invoices in Xero for
Portal-created rows (`created_via` portal/reenrolment) that do not yet have
`xero_invoice_id`. On success the share row is stamped with the Xero InvoiceID.
If the invoice is already **paid** in Portal, payment write-back runs immediately.

Also available: **Export to Xero CSV** as a manual import fallback.

## Payment write-back

When a family invoice is marked **paid** in the portal (Stripe Checkout, admin
Confirm paid, or credit apply), Portal posts a matching **Payment** in Xero
if the share row has a `xero_invoice_id`.

## Secrets (Supabase Edge Functions)

```bash
XERO_CLIENT_ID="..."
XERO_CLIENT_SECRET="..."
XERO_REFRESH_TOKEN="..."   # from Xero OAuth consent; rotates — update when Xero issues a new one
XERO_TENANT_ID="..."       # organisation connection id
XERO_BANK_ACCOUNT_CODE="090"  # optional; bank/clearing for Payments (default 090)
XERO_SALES_ACCOUNT_CODE="200" # optional; sales account for ACCREC lines (default 200)
```

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

## Admin usage

- Prefer **Push to Xero** for Portal-generated invoices.
- For uploaded Xero PDFs, paste the Xero **InvoiceID** (GUID) so payment write-back works.
- Contact mapping is stored on `portal_parent_contacts.xero_contact_id`.

## Redeploy after setting secrets / scopes

- `portal-admin-xero-batch-push`
- `parent-portal-stripe-webhook`
- `portal-admin-parent-invoices-upsert`
- `parent-portal-credit-apply-invoice`

If secrets are missing, payments still work in the portal; Xero is simply skipped.
