# Session feedback imports (legacy)

**Canonical source:** `working_ui/portal-import-bundle/` → run:

```bash
python database/import_portal_bundle.py
```

That script copies the bundle to `database/portal_import_bundle/`, removes old per-tramo feedback/overview CSVs, writes:

- `working_ui/portal/session_feedback_portal_data.js`
- `working_ui/portal/session_feedback_status_portal_data.js`
- `database/roster_weeks/summer-term-2026-week-*.csv`

Optional gap fill **30 Apr–10 May**: place `.xlsx` here (emoji-header export). Not stored as CSV.

Do **not** add `session-feedback-from-*.csv` or `sessions-overview-*.csv` here anymore — use the bundle.
