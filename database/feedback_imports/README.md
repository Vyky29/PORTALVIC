# Session feedback CSV imports

**v1** (`SPREADSHEETS/v1SessionFeedback (PORTAL).xlsx`) = feedback **13 Apr → 30 Apr 2026** (already in `session_feedback_portal_data.js` on Vercel).

Add **later tramos** as CSV here (same columns as v1 / admin grid):

`Date`, `Client name`, `Instructor`, `Service`, `Attendance`, `Engagement`, `Emotions`, `Independence`, `Positive`, `Parent / challenges`, `Incidents`

| Period | File (in `feedback_imports/` or `working_ui/`) |
|--------|--------------------------------------------------|
| 30 Apr → 10 May | `.xlsx` with emoji headers (e.g. `30th to 10th may.xlsx`) |
| 11 May → 19 May | `.csv` from other project (e.g. `session-feedback-from-2026-05-11.csv`) |

Export from Excel: **Save As → CSV UTF-8** from the sheet/tab that matches v1 columns (or filter date range then export).

Then run:

```bash
python database/import_session_feedback_csv.py
```

This **keeps** v1 rows and **adds/overrides** rows from CSV (same date + client + instructor + service + attendance = one row).

Output: `working_ui/portal/session_feedback_portal_data.js` → commit + push for Vercel.

**Roster** weeks stay in `database/roster_weeks/` (separate pipeline).
