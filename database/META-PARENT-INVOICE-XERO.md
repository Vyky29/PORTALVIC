# Parent invoices → Xero payment write-back

When a family invoice is marked **paid** in the portal (Stripe Checkout, admin
Confirm paid, or credit apply), Portal can post a matching **Payment** in Xero
if the share row has a `xero_invoice_id`.

## Secrets (Supabase Edge Functions)

```bash
XERO_CLIENT_ID="..."
XERO_CLIENT_SECRET="..."
XERO_REFRESH_TOKEN="..."   # from Xero OAuth consent; rotates — update when Xero issues a new one
XERO_TENANT_ID="..."       # organisation connection id
XERO_BANK_ACCOUNT_CODE="090"  # optional; Xero account code for bank/clearing (default 090)
```

Create a Xero app (Custom connection or OAuth2) with at least **accounting.transactions**
(write) scope. After the first refresh, if logs warn about a new refresh token,
update `XERO_REFRESH_TOKEN` in secrets.

## Admin usage

When uploading / sharing a family invoice PDF, paste the Xero **InvoiceID** (GUID
from Xero invoice URL or API), not only the invoice number. Invoice # still shows
to parents; the GUID is what write-back uses.

## Redeploy after setting secrets

- `parent-portal-stripe-webhook`
- `portal-admin-parent-invoices-upsert`
- `parent-portal-credit-apply-invoice`

If secrets are missing, payments still work in the portal; Xero is simply skipped.
