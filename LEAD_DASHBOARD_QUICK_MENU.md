# Lead dashboard — Quick menu grouping (`working_ui/lead_dashboard.html`)

Canonical structure for **Lead dashboard → dock → Quick menu** (section `#menuSheet`). Keep this in sync when adding tools.

## Staff Tools (participant-facing)

Placed **above** Lead Tools. Relates to **participants / programmes** (service users, not staff).

| Button           | Sheet id                 | Notes                                      |
|------------------|--------------------------|--------------------------------------------|
| Session Plan     | `leadSessionPlanSheet`   | Participant sessions & programmes          |
| Term Review      | `leadTermReviewSheet`    | Per-participant term reviews               |

## Lead Tools (staff-facing)

Placed **below** Staff Tools. Relates to **staff** (observation, performance).

| Button              | Sheet id                       | Notes                                |
|---------------------|--------------------------------|--------------------------------------|
| Observation         | `leadObservationSheet`       | Observe instructors / sessions       |
| Performance Review  | `leadPerformanceReviewSheet` | Staff performance & development    |

## Other Quick menu groups (unchanged)

- **Reminders** — portal reminder banner (when shown)
- **Work** — Drop off / Pick up, Timesheet, Expenses
- **Training** — Induction, Safeguarding, Trainings
- **Settings** — Alerts, View, Update photo, Log out

## Implementation notes

- Sheet open/close uses `[data-open="…"]` and `openSheet(id)`; new sheets must exist as `<section class="sheet …" id="…">`.
- Staff tool tiles use class `menu-btn--staff-tool`; lead tool tiles use `menu-btn--lead-tool` (shared grey tile styles in CSS).

Copy this file into external docs or AI “memory” so the **Staff vs Lead** split is not lost before go-live.
