# Incident follow-up + Individual Support Plan

## Phase A
Triage, follow-up form, Support Plan Update (Update Profile / Edit / Cancel), staff **Individual Support Plan** button.

## Phase B/C (2026-07-10)
- Meetings: type, datetime, Teams/in person, invitees (submitter + owners prefilled)
- Availability: Send requests → staff announcements + respond in Individual Support Plan
- Confirm meeting → notify invitees
- Instructor review: if admin ≠ primary owner, Update Profile waits for Approve/Reject
- Notify staff when plan activates

## Edge Functions
- `portal-admin-incident-followup`
- `portal-incident-followup-staff`

## Phase D (2026-07-10) — service-scoped generals + library fork
- **General** library rows are tagged by service (`all`, `swimming`, `climbing`, `outing`, …). Opening a participant ISP auto-creates their plan (if missing) and syncs matching generals.
- **Individual** rows are added over time; every participant has a plan shell so staff can keep adding.
- Selecting a library item and editing it **forks** a new library entry (original untouched) and saves that onto the plan.
- Migration: `20260710200000_portal_isp_service_scoped_library.sql`
- Shared helper: `supabase/functions/_shared/portal_isp_library.ts`
- Staff actions: `ensure_support_plan`, `list_library`, `add_plan_item`, `update_plan_item`

## Later polish
- Cron review reminders (Step 12)
- Deep-link from announcements sheet
- Broader service detection (day-centre outing flags beyond schedule activity labels)

## Parent contact
- Follow-up form / meetings are **internal staff only** (no parent fields in the follow-up panel).
- Informal parent WhatsApp/email stays on the existing incident **Notify parent** flow (`portal_incident_parent_notify.js`).

