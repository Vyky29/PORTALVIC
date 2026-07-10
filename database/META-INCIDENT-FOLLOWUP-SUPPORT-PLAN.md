# Incident follow-up + Individual Support Plan (Phase A)

Shipped 2026-07-10. Additive on top of existing incident submit / owner notify / parent notify.

## What works now

1. **Admin** opens an incident (Sessions Hub → Incidents → View).
2. **Triage**: No follow-up (archive) · Admin review only · Formal meeting (form now; scheduling = Phase B).
3. **Follow-up form**: findings, root cause, parent/staff notes, lessons, strategies table, summary.
4. **Complete Follow-up** → Support Plan Update preview with **Update Profile / Edit / Cancel**.
5. **Update Profile** activates `portal_support_plans` + items for the participant.
6. **Staff** participant card → **Individual Support Plan** button (next to General Info / Sessions Overview).

## Tables

- `incident_reports.workflow_status`, `triage`, …
- `portal_incident_followups`, `portal_incident_followup_strategies`
- `portal_support_plans`, `portal_support_plan_items`, `portal_support_plan_updates`

## Edge Function

`portal-admin-incident-followup` — actions: `get`, `triage`, `save_followup`, `complete_followup`, `apply_support_plan`, `cancel_support_plan_update`, `reopen_followup`, `get_plan_by_name`.

## Not in Phase A

Meeting invites / availability (Steps 3–6), primary instructor approve (Step 9), staff notify blast (Step 11), review reminders (Step 12).
