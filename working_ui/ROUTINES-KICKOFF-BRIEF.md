# Routines + Staff Portal — kickoff brief

Shared coordination between **visualVIC** (Routines / Planner) and **PORTALVIC** (Staff Portal).

## Architecture

| App | Repo | Prod URL (today) | Role |
|-----|------|------------------|------|
| Staff Portal | PORTALVIC → `working_ui/` | https://portalvic.vercel.app | Login, dashboards, roster |
| Routines | visualVIC (Next.js) | https://visual-vic.vercel.app | Library, player, Focus, **Planner** |

**Same Supabase project (Portal)** — not Onboarding (`aptbbkmvkjybjgrrwxpr`).

| Field | Value |
|-------|--------|
| Project ref | `cklpnwhlqsulpmkipmqb` |
| URL | `https://cklpnwhlqsulpmkipmqb.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/cklpnwhlqsulpmkipmqb |

Anon key: set in Vercel env for **both** apps — do not commit to git.

## Scope v1 (confirmed)

**Include:** core, shower, dress-on, dress-off, tailored (Ikram, Serine, Ayaan, Emmanuel).

**Exclude v1:** brushing teeth.

## Planner permissions

Uses `staff_profiles.app_role` (lowercase): `staff` | `lead` | `admin` | `ceo`.

| Role | Planner library |
|------|-----------------|
| `ceo`, `admin` | Full library |
| `lead`, `staff` | Universal packs + tailored packs listed in `staff_participant_access` |

Inactive profiles (`is_active = false`) → no access.

### Participant assignments (seed)

| Person | app_role | participant_slug(s) |
|--------|----------|------------------------|
| Luliya | staff | ikram, emmanuel |
| Youssef | staff | ikram, emmanuel |
| Michelle | lead | ikram, emmanuel |
| Sandra | staff | serine, ayaan |
| Victor, Raul, Javi | ceo | *(none — full access)* |

## Portal tasks (this repo does not implement HTML dashboards)

1. Run SQL migration: `npm run apply:staff-participant-access` (or [`database/migrations/20260617120000_staff_participant_access.sql`](../database/migrations/20260617120000_staff_participant_access.sql))
2. Seed rows for staff above (match `staff_profiles.id` after auth exists)
3. **Planner** link on staff / lead dashboards — **done** via `ROUTINES_PLANNER_URL` in `portal-static-bootstrap.js` (topbar **Plan** + quick menu):

   ```text
   https://visual-vic.vercel.app/planner
   ```

   Snippet: [`working_ui/portal/planner-link-snippet.html`](./portal/planner-link-snippet.html)

## Routines tasks (visualVIC — this repo)

1. `/planner` — filtered library + build routine
2. `/planner/login` — Supabase email/password (same Portal project)
3. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Optional: `NEXT_PUBLIC_STAFF_PORTAL_URL=https://portalvic.vercel.app`

## Auth note (cross-domain)

Portal and Routines are different origins. Session cookies are **not** shared. Staff may sign in again on `/planner/login` with the same corporate email/password. v2: SSO or magic-link handoff.

## Roster

**Not v1.** Assignments use `staff_participant_access.participant_slug`. Linking to `portal_roster_rows.client_name` is phase 2.

## URLs (confirmed)

- **Routines prod:** https://visual-vic.vercel.app
- **Planner:** https://visual-vic.vercel.app/planner
- **Planner login:** https://visual-vic.vercel.app/planner/login
- **Staff login:** https://portalvic.vercel.app/login.html

## Pre-go-live checklist (Sandra / Youssef)

| Item | Owner | Status |
|------|-------|--------|
| Vercel visualVIC — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_STAFF_PORTAL_URL` in **Production** | visualVIC | ☐ |
| Supabase — `staff_participant_access` migration + assignment seeds | Portal | ✅ (`npm run apply:staff-participant-access`) |
| Portal — **Plan** → `https://visual-vic.vercel.app/planner` | Portal | ✅ |
