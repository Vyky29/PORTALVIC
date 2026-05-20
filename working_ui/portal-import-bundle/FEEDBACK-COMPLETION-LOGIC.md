# Feedback completion logic (Portal 2026)

This document mirrors `portal-shared-js/admin-sessions-hub.js` — the **Sessions Overview** tab.
If your other app shows "missing feedback" but Portal shows **Feedback submitted**, you are probably counting **per staff user** or **per exact time** instead of **per feedback unit**.

## Golden rule

> **One submitted `session_feedback` row can mark several roster slots as done.**  
> Co-instructors on the same session share the same `portal_session_key`.  
> Do **not** require every instructor to submit.

Staff dashboard uses RPC `portal_feedback_submitted_keys_for_sessions`: if **anyone** submitted for a roster `portal_session_key`, all staff on that slot see it as done.

## How Overview decides "Feedback submitted"

For each roster slot (after omit rules):

1. **Absent** → counts as done for the day column (no feedback needed).
   - Quick mark: `portal_staff_session_quick_marks` with `mark_type = absent`
   - Or `session_feedback.attendance` starts with `No`

2. Else **feedback complete** if `slotFeedbackComplete(slot)` is true:
   - **ACAT Monday 11:00–12:00**: one row for client `Acat` covers Jack W, Jack S, Kamy, Kate (individual rows hidden in overview).
   - **Day Centre** (Emmanuel, Ikram, Fadi): **one feedback per client per calendar day** — key `YYYY-MM-DD|client_slug|day_centre`. Any block that day shares it.
   - **Sunday merge groups** (`sundayFeedbackMerges` in roster bundle): e.g. Yusuf 9:00 + 9:30 with Roberto = one feedback for both slots.
   - **Sunday hub teams**: hub multi blocks for Giuseppe/John/Bismark teams — one feedback per client+team+area.
   - **Direct match**: a feedback row `feedbackFitsSlot(fb, slot)` (same date, client slug, compatible service/time/area; instructor area rules on Sunday multi).
   - **Late submit**: `late_session_feedback = true` allows `session_date` on feedback to be **roster day + 1** (e.g. Sunday session logged Monday).

3. Matching uses **aliases**, not only exact `portal_session_key`:
   - Slot keys: `session_key`, `date|time|client`, `feedback_unit_key`
   - Feedback keys: `portal_session_key`, normalized variants, date+client, date+time+client+area

## `feedback_unit_key` (join in your app)

Computed per roster slot:

| Service type | Unit key pattern |
|--------------|------------------|
| Day Centre | `{date}|{client_slug}|day_centre` |
| Bespoke / Multi-Activity | `{date}|{client_slug}|{time_start}|{service}|{area}` |
| Most others (swim, fitness, …) | `session_key` or `{date}|{client_slug}|{time_start}` |

Use **`sessions-with-feedback-status-*.csv`** — column `overview_status` is what Portal shows.

## Import order in the other project

1. `sessions-overview-*.csv` — roster / bookings  
2. `session-feedback.csv` — attach text to units (match by `portal_session_key` + rules above)  
3. `absents.csv` — mark absent  
4. `cancellations.csv` / `incidents.csv`  
5. Recompute status using this logic (or trust `sessions-with-feedback-status-*.csv`)

## Common mistake (yesterday "missing" feedback)

- Counting feedback where `submitted_by_user_id = current_staff` only.  
- Requiring `session_time` on feedback to equal roster `time_slot` exactly (Day Centre and Sunday multi often differ).  
- Ignoring merge group / ACAT / Day Centre shared units.  
- Using `created_at` instead of `session_date` on the feedback row.

Source code: `portal-shared-js/admin-sessions-hub.js` (`slotFeedbackComplete`, `feedbackFitsSlot`, `feedbackUnitKey`, `mergeGroupFeedbackComplete`).
