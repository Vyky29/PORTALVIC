# Employment contracts — Portal Vic + HR portal

Integrated flow using the same Supabase project as [PORTALVIC](https://github.com/Vyky29/PORTALVIC) (`cklpnwhlqsulpmkipmqb`).

## Flow

1. **HR** — [hr-contract-portal.vercel.app](https://hr-contract-portal.vercel.app): prepare contract, director signs, **Send to employee**.
2. **Supabase** — row in `employment_contracts` + targeted row in `portal_staff_announcements` (`message_type = contract_signing`, `delivery_scope = single_user`).
3. **Staff dashboard** — notice like an announcement ? **Open contract to sign**.
4. **Staff** — `contract_sign.html` (logged in) ? sign ? PDF to **`documents`** (My Documents).
5. **Dashboard** — notice cleared via local ack (same store as announcements).

## Apply migration

In Supabase SQL Editor (project linked to Portal):

```text
database/migrations/20260521120000_employment_contracts_portal.sql
```

Requires existing: `portal_staff_announcements`, `portal_staff_profile_is_admin_or_ceo()`, `documents` bucket.

## HR portal env (Vercel)

Use the **same** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as Portal Vic.

| Variable | Example |
|----------|---------|
| `SUPABASE_URL` | `https://cklpnwhlqsulpmkipmqb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (from Supabase dashboard) |
| `PORTAL_SITE_URL` | `https://portalvic.vercel.app` |

Employee email must match their **Supabase Auth** login email.

## Admin (Lightning / admin dashboard)

**Staff & HR** ? **Open HR Contract Portal** ? send from Step 4.

Or use **Communications** ? compose announcement (contracts are sent automatically from HR portal, not from compose).

## Files

| Path | Role |
|------|------|
| `working_ui/contract_sign.html` | Staff signing page |
| `working_ui/portal/contract-core.js` | Contract template + PDF |
| `working_ui/portal/portal_employment_contract.js` | Sign + documents upload |
| `working_ui/staff_dashboard.html` | `contract_signing` notices |
| `hr-contract-portal/api/lib/portal_publish.js` | Dashboard publish on create |
