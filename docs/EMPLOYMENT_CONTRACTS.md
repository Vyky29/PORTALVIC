# Employment contracts — Portal Vic + HR portal

Integrated flow using the same Supabase project as [PORTALVIC](https://github.com/Vyky29/PORTALVIC) (`cklpnwhlqsulpmkipmqb`).

**Contract engine version:** `2.0` (`contract-core.js`)

## Contract kinds (v2.0)

| Kind ID | UI label | Pay | Hours | Notice | Typical profile |
|---------|----------|-----|-------|--------|-----------------|
| `zero_hours` | Zero Hours — Activity Services | Hourly + scale; rolled-up holiday **12.07%** itemised | No minimum | **2 weeks** | School-main job; evening/weekend activity sessions |
| `day_centre_part_time` | Part-Time — Day Centre | **Annual salary** | Selected weekdays **11:00–16:00** (5 paid h/day); short comfort break if possible | **1 month** | Day Centre only, or morning half of hybrid staff |
| `full_time` | Permanent Full-Time | **Annual salary** (manual) | **40 h/week** default | **1 month** | Business Development |
| `fixed_term` | Fixed-Term | Annual salary | As set | **1 month** / End Date | Cover / pilot |
| `permanent_part_time` | *(deprecated)* | — | — | — | Legacy term-time swimming only; hidden in UI |

### Hybrid staff (Day Centre + evenings)

Issue **two** contracts:

1. `day_centre_part_time`
2. `zero_hours` (Activity Services)

Tick **runs alongside another active contract** on both and add the other reference where known. Concurrent wording does **not** supersede the other agreement.

## Policy lock (Fase 0)

- Day Centre: 5 paid hours 11–16; comfort break 10–15 min if possible (does not reduce pay)
- Zero Hours holiday: rolled-up **12.07%** itemised on payslips
- Full-time / Day Centre holiday: **28 days + bank holidays** (pro-rata for part-time vs 40h FTE)
- Term-time swimming permanent PT: **removed** from new-issue UI

## Flow

1. **HR** — Portal Vic `hr_contract.html` / admin embed, or [hr-contract-portal.vercel.app](https://hr-contract-portal.vercel.app): prepare contract, director signs, **Send to employee**.
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
| `working_ui/hr_contract.html` | Admin/CEO wizard |
| `working_ui/portal/contract-core.js` | Templates + PDF (canonical; sync to `portal-shared-js/` and `hr-contract-portal/js/`) |
| `working_ui/portal/hr-contract-app.js` | Form / preview / send |
| `working_ui/portal/hr-contract-embed-html.js` | Admin dashboard embed markup |
| `working_ui/contract_sign.html` | Staff signing page |
| `working_ui/portal/portal_employment_contract.js` | Sign ? PDF ? My Documents |
| `hr-contract-portal/` | Standalone Vercel HR portal (same kinds) |

## Company details

- Legal name: clubSENsational LTD  
- Company no.: 13755417  
- Registered address: 71-75 Shelton Street, Covent Garden, WC2H 9JQ, London, United Kingdom  

## Legal note

Templates are designed to meet ERA 1996 s.1 written particulars and current irregular-hours holiday practice. Have an employment solicitor review before mass issue. ERA 2025 zero-hours guaranteed-hours rights are expected to phase in; contracts state compliance with applicable law as amended.
