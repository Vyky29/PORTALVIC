# PORTAL Supabase Go-Live Checklist

Use this order to enable staff login with username (not email in UI).

## 1) Create Auth users

- In Supabase Dashboard -> Authentication -> Users -> Add user
- Create one user per row in `database/staff_auth_users_seed.csv`
- Use the `auth_email` and `temp_password` columns
- You can force password reset later when real emails are set

## 2) Seed staff profiles (CHECK `ceo` incluido al inicio del archivo)

- Run the **entire** `database/staff_profiles_seed.sql` in SQL editor (**Run**, not Explain).
- The file starts with the `app_role` CHECK migration, then the profile upsert.

## 3) Link auth users + fill profile roles/routes (mismo fix al inicio)

- Run the **entire** `database/supabase_staff_bootstrap.sql` in SQL editor.

Optional standalone DDL only: `database/supabase_staff_profiles_allow_app_role_ceo.sql` (app_role + `staff_role` checks, same as embedded at top of seeds).

This script:
- ensures `public.staff_profiles.user_id` exists
- links `public.staff_profiles.user_id` to `auth.users.id`
- fills `app_role`, `staff_role`, and `dashboard_route` if missing

## 4) Verify data health

Run:

```sql
select username, user_id, app_role, staff_role, dashboard_route
from public.staff_profiles
order by username;
```

You should see:
- `user_id` populated for all active staff
- `dashboard_route` populated
- **CEO** (`Javi`, `Victor`, `Raul`): `app_role` = `ceo`, default route CEO hub
- **Admin** (`Sevitha`): `app_role` = `admin`, admin dashboard route
- **Leads** (`John`, `Berta`): `app_role` = `lead`
- **Staff**: everyone else (CEOs also use staff dashboard for shifts)

## 5) Login test

- Open login page
- Enter `Name` (e.g. `Roberto`) and password (`PortalTemp#2026`)
- Expected: redirect to matching dashboard

## Notes

- Login UI intentionally uses name + password (email hidden from users).
- Internal email resolution is handled by `database/auth-map.js`.
- Replace placeholder onboarding emails with real emails later, then rerun bootstrap mapping.
