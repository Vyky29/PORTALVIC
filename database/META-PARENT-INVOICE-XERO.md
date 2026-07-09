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

Create a Xero **Web app** (OAuth2). Apps created on/after **2 March 2026** must use
**granular** scopes (broad `accounting.transactions` is rejected).

Portal write-back only calls `POST /Payments`, so request at least:

```
openid profile email offline_access accounting.payments
```

Optional if you later read/update invoices via API: `accounting.invoices`.

There is **no** authorize URL builder in this repo (no NextAuth / no Edge Function
callback). First consent is a one-off browser URL, then store `refresh_token` +
`tenantId` in secrets. Redirect URI used for that one-off:

```
http://localhost:8787/xero-callback
```

Authorize (replace `YOUR_CLIENT_ID`):

```
https://login.xero.com/identity/connect/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fxero-callback&scope=openid%20profile%20email%20offline_access%20accounting.payments&state=portal
```

After the first refresh, if logs warn about a new refresh token, update
`XERO_REFRESH_TOKEN` in secrets.

## Admin usage

When uploading / sharing a family invoice PDF, paste the Xero **InvoiceID** (GUID
from Xero invoice URL or API), not only the invoice number. Invoice # still shows
to parents; the GUID is what write-back uses.

## Redeploy after setting secrets

- `parent-portal-stripe-webhook`
- `portal-admin-parent-invoices-upsert`
- `parent-portal-credit-apply-invoice`

If secrets are missing, payments still work in the portal; Xero is simply skipped.
