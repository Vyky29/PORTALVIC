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
