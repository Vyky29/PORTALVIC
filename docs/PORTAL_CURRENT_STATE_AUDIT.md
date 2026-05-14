# PORTAL — Current state audit (workspace snapshot)

**Purpose:** Structured documentation of the **real, current** implementation in this repo for external comparison.  
**Scope:** `working_ui/`, `database/migrations/`, related `database/` assets, `backup_ui/` (read-only reference), `portal_legacy/` (non-operational legacy).  
**Script/cache version (project policy):** `?v=20260419-99` — documented as enforced across PORTAL (HTML/JS) where a cache-bust query is used; see Script Versioning.

---

## Root Structure

- **`working_ui/`** — Only editable shipped HTML/CSS/JS for the portal (workspace rule). Source of truth for browser-facing portal UI.
- **`backup_ui/`** — Read-only reference; do not edit per project rules.
- **`database/`** — SQL migrations (`database/migrations/*.sql`), standalone SQL helpers, and mirrored JS used in production often via WordPress uploads (`auth-handler.js`, `supabase-client.js`, `staff_dashboard_spreadsheet_bundle.js`, `clients_info_embed.js`, `term_from_timetable.js`, `staff_dashboard_spreadsheet_adapter.js`, etc.).
- **`portal_legacy/`** — Older portal tree; not the active operational root for current `working_ui` flows.
- **No app server in repo root** — “Backend” = Supabase + static assets.

**Active frontend pages (17 × `working_ui/*.html`):**  
`login.html`, `ceo_dashboard.html`, `staff_dashboard.html`, `lead_dashboard.html`, `admin_dashboard.html`, `session_feedback.html`, `incident_report.html`, `cancellation_report.html`, `expenses.html`, `timesheet.html`, `pickup.html`, `company_insights.html`, `Working_interview.html`, `lead_feedback_report.html`, `venue_review.html`, `performance.html`, `swtermreview.html`.

**Companion JS in `working_ui/`:**  
`lead_feedback_report_app.js`, `venue_review_app.js`, `staff_performance_review_app.js`, `swtermreview_app.js`, `expenses_app.js` (exists in repo; **not** referenced by `expenses.html` at time of audit), `onboarding_portal_config.example.js`.

**Recent additions (development thread):**  
`performance.html` + `staff_performance_review_app.js`; migrations `20260425_staff_performance_reviews.sql`, `20260426_session_feedback_lead_select_all.sql`; `swtermreview.html` split to `swtermreview_app.js`.

---

## Active User Flows

- **Today / This Week / Term + view-day vs “live” header:** Implemented in `staff_dashboard.html` and `lead_dashboard.html` using `DEMO_VIEW_DAY`, `portalReviewDate`, `__PORTAL_REVIEW_DAY_URL_LOCK`, sheets (`termSheet`, etc.), and spreadsheet adapter model (`StaffDashboardSpreadsheetAdapter` / `STAFF_DASHBOARD_SOURCE`). Term calendar intro copy (`TERM_COLOR_INTRO_BODY_MAIN` on staff) describes shift days staying blue until register/feedback complete, then green; orange if still missing 3h after shift end (admins notified).
- **Feedback:** `session_feedback.html` → Supabase `session_feedback` insert. Return URL uses `portalAfterFeedback=1` and `portalReviewOrigin` ∈ `dashboard` | `this_week` | `term`. Dashboards call RPC `portal_feedback_submitted_keys_for_sessions` for shared-slot keys.
- **Incident:** `incident_report.html` → `incident_reports` insert; clears `portalAfterFeedback` and sets `portalReviewOrigin` for return.
- **Cancellation:** `cancellation_report.html` → `cancellation_reports` insert; sets `portalAfterFeedback=1` and `portalReviewOrigin`.
- **Venue Report:** `venue_review.html` + `venue_review_app.js` → `venue_reviews` insert.
- **Lead Feedback Report:** `lead_feedback_report.html` + `lead_feedback_report_app.js` → `lead_session_reports` (separate from staff `session_feedback`).
- **Other:** Expenses (`expense_claims`), timesheet (`staff_timesheets`), pickup/handover (`daily_handover_logs`), onboarding interview (`onboarding_candidates`), swimming term review UI (`swtermreview` — client-side PDF only, no dedicated table in repo).

---

## Current Page Inventory

| File | Role |
|------|------|
| `login.html` | Portal login; loads `auth-handler.js` with version via `portalJsVer`. |
| `ceo_dashboard.html` | CEO shell; dynamic `auth-handler` import. |
| `staff_dashboard.html` | Staff hub: sessions, review colours, term/week/today, links to forms, Supabase profile/avatar, spreadsheet bundles. |
| `lead_dashboard.html` | Lead operational dashboard (high parity with staff patterns). |
| `admin_dashboard.html` | Admin panel; Supabase bootstrap + logout. |
| `session_feedback.html` | Per-session staff/lead feedback form. |
| `incident_report.html` | Incident reporting. |
| `cancellation_report.html` | Cancellation reporting. |
| `expenses.html` | Expense claim form (+ Make webhook in markup; inline Supabase script). |
| `timesheet.html` | Timesheet; EmailJS + html2pdf + Supabase. |
| `pickup.html` | Daily handover; Supabase JS from CDN. |
| `company_insights.html` | Loads static JSON `data/portal_insights_sources.json`. |
| `Working_interview.html` | Onboarding interview; `onboarding_candidates`. |
| `lead_feedback_report.html` | Lead session narrative report. |
| `venue_review.html` | Venue review form. |
| `performance.html` | In-meeting performance review (admin/ceo/lead). |
| `swtermreview.html` | Swimming term review (client-side PDF). |

---

## Current Review Logic

- **Orange (`session-card--review-needed`):** Real client row with `sessionKey`, session ended for feedback (`isSessionEndedForFeedback`), and no completing state applied earlier in `sessionReviewRowClass` (not `feedbackDone`, not `cancelled`, not `incident`-orange path, not `absent`→green).
- **Green (`session-card--review-done`):** `feedbackDone` or `absent` in per-session review record.
- **Incident:** `session-card--review-incident` (orange family in CSS).
- **Cancelled / absent / others:** `session-card--review-cancelled`, `--review-absent`, etc.
- **Local map:** `sessionReviewMapMemory` + `localStorage` key `portalSessionReviewMap_v1`; hydrated on load.
- **Pending:** Derived from end-of-session + missing feedback in map / sync with Supabase per implemented flows.
- **Historical vs live:** `DEMO_VIEW_DAY` + URL locks align “view weekday” with `portalReviewDay` / post-feedback return; comments distinguish real “today” header vs historical view.
- **Post-submit:** Forms set `portalAfterFeedback=1` + `portalReviewOrigin`; dashboard consumes (`portalCapturePostFeedbackLanding` / `__postFbLand`), may set `DEMO_VIEW_DAY`, strips query params, refreshes UI blocks.

**Constants:** `STAFF_DASH_FORCE_SESSIONS_ENDED = false` (staff + lead) — if `true`, would force “session ended” for orange eligibility.

---

## Slot Types

- **`sessionModelStatus`:** `Closed` if `status` or `clientId` is `closed`. “Available” aggregates `available`, `no client`, `no_client`, `noclient`, or name matching `no client`.
- **Row `kind`:** `closed` and `available` rendered as dedicated cards (`session-card--closed` / `--available`); excluded from review sync loops (`continue` when `closed` or `available`).
- **`portalIsRealClientSession` / `window.__portalIsRealClientSession`:** Treats `closed` / `available` as non-real client for feedback/review logic.
- **Click / pointer:** Closed demo row in Today uses `pointer-events: none` in embedded example; production render follows `renderSessionRow` patterns in dashboard.

---

## Frontend / Backend Separation (major surfaces)

| Area | Frontend | Backend |
|------|----------|---------|
| Staff / lead dashboards | Large inline JS + UI in HTML | Supabase (profile, session, RPC, uploads) + spreadsheet bundle/adapter URLs |
| Session / incident / cancellation / timesheet / expenses | HTML + inline scripts | Supabase tables per migration |
| Lead report / venue review / staff performance review | HTML + `_app.js` module | Supabase inserts |
| `swtermreview` | HTML + `swtermreview_app.js` | None in repo (jsPDF only) |
| `pickup` | Inline JS in HTML | `daily_handover_logs` |
| `company_insights` | Inline JS | Static JSON file |
| `Working_interview` | Inline + CDN Supabase | `onboarding_candidates` |

**Moved logic (recent):** `swtermreview` → external `swtermreview_app.js`; lead/venue/staff-performance already paired HTML+app JS.

---

## HTML Separation Status

| Page | Status | Notes |
|------|--------|--------|
| `swtermreview.html` | **Separated** | `swtermreview_app.js` |
| `lead_feedback_report.html` | **Separated** | `lead_feedback_report_app.js` |
| `venue_review.html` | **Separated** | `venue_review_app.js` |
| `performance.html` | **Separated** | `staff_performance_review_app.js` |
| `expenses.html` | **Mixed** | Inline script; `expenses_app.js` not linked |
| `staff_dashboard.html`, `lead_dashboard.html` | **Mixed** | Very large inline JS + external scripts |
| `session_feedback.html`, `incident_report.html`, `cancellation_report.html`, `timesheet.html`, `company_insights.html` | **Mixed** | Primary logic in page |
| `Working_interview.html` | **Mixed** | Multiple scripts, large inline |
| `pickup.html` | **Mixed** | Large inline |
| `login.html`, `ceo_dashboard.html` | **Light / partial** | Dynamic auth-handler load |
| `admin_dashboard.html` | **Partial** | Module import + inline UI |

---

## Supabase / Backend State

**Tables referenced from `working_ui` (via `.from(` grep):**  
`staff_profiles`, `session_feedback`, `incident_reports`, `cancellation_reports`, `expense_claims`, `staff_timesheets`, `onboarding_candidates`, `lead_session_reports`, `venue_reviews`, `staff_performance_reviews`, `daily_handover_logs`.

**Migrations (`database/migrations/`):**

| File | Purpose (short) |
|------|-----------------|
| `20260415_session_feedback.sql` | Base `session_feedback` + RLS |
| `20260416_session_feedback_context.sql` | Context columns |
| `20260417_session_feedback_insert_rls_fix.sql` | Insert RLS fix |
| `20260418_session_feedback_nullable_second_phase.sql` | Nullable second phase |
| `20260420_incident_reports.sql` | Incident reports |
| `20260420_cancellation_reports.sql` | Cancellation reports |
| `20260420_session_feedback_insert_rls_ceo_admin.sql` | CEO/admin insert |
| `20260420_portal_auth_generation_and_review_select.sql` | Auth generation bump + SELECT own rows |
| `20260421_portal_feedback_shared_session_keys_rpc.sql` | RPC `portal_feedback_submitted_keys_for_sessions` |
| `20260422_venue_reviews.sql` | Venue reviews |
| `20260423_lead_session_reports.sql` | Lead session reports |
| `20260423_timesheets_backend.sql` | Timesheets |
| `20260423_expense_claims_backend.sql` | Expense claims |
| `20260424_onboarding_candidates.sql` | Onboarding candidates |
| `20260425_staff_performance_reviews.sql` | Staff performance reviews |
| `20260426_session_feedback_lead_select_all.sql` | Lead SELECT all `session_feedback` |

---

## Return / Navigation

- **Origin:** `portalReviewOrigin` normalized to `dashboard` | `this_week` | `term` when opening feedback from dashboards.
- **Return:** `portalAfterFeedback=1` + `portalReviewOrigin`; dashboard strips params after handling and refreshes relevant views / term calendar / `DEMO_VIEW_DAY` when applicable.

---

## Lead / Reporting Logic

- **Venue:** `venue_review_app.js` → `venue_reviews` insert.
- **Lead session report:** `lead_feedback_report_app.js` → `lead_session_reports`; not `session_feedback`.
- **Data sources:** Querystring context + `staff_profiles` + spreadsheet scripts where configured (incident, cancellation, session_feedback pages).
- **Read-only vs interactive:** Report forms interactive; `company_insights` reads JSON only.

---

## Script Versioning

**Policy:** `?v=20260419-99` on portal CDN scripts and local `_app.js` references where used.

**Observed aligned:** `auth-handler.js`, `clients_info_embed.js`, `staff_dashboard_spreadsheet_bundle.js`, `staff_dashboard_spreadsheet_adapter.js`, `term_from_timetable.js`, `supabase-client.js` (dashboard constants and `database/supabase-client.js` jsdelivr import), html2pdf/emailjs (timesheet), jsdelivr supabase (pickup, `Working_interview.html`) with `?v=20260419-99`, `company_insights` JSON URL, `swtermreview` jsPDF + app JS, module app scripts, `login`/`ceo` `portalJsVer = "20260419-99"`, `Working_interview.html` `onboarding_portal_config.js?v=20260419-99`.

**Note:** Image/asset URLs (logos, PNG) often have no cache-bust query; separate from JS versioning.

---

## Not Yet Implemented

- Staff dashboard sheets: **“Content coming soon”** for `staffTermReviewSheet` (per-participant term review in dashboard) and session planning placeholder.
- `swtermreview`: no Supabase persistence in repo.
- Server-driven push for alerts: UI copy states not wired.
- In-dashboard term review product vs standalone `swtermreview.html`: dashboard sheet remains placeholder.

---

## Temporary Decisions / Flags

- `STAFF_DASH_FORCE_SESSIONS_ENDED = false` (staff + lead).
- `window.__PORTAL_TERM_DEMO_VISUALS__` + `STAFF_DASH_TERM_COLOR_INTRO_DEMO` for term calendar intro/demo labelling.
- Session review UX layer in **localStorage** alongside Supabase.
- **Pickup:** snake_case / camelCase dual attempts for schema compatibility; conditional deletes tied to “today” logic in file.

---

*Generated from repository read-only audit; does not assert which SQL has been applied on the live Supabase project.*
