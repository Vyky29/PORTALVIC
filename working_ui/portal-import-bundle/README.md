# Portal import bundle (Summer Term 2026)

Copy **this whole folder** into the PORTAL repo as `working_ui/portal-import-bundle/`, then run:

```bash
python database/import_portal_bundle.py
```

That removes legacy feedback/overview CSVs and deploys JS under `working_ui/portal/`.

## Files

| File | Contents |
|------|----------|
| `FEEDBACK-COMPLETION-LOGIC.md` | **Read this** — shared feedback / overview rules |
| `sessions-overview-2026-05-13_19.csv` | Roster week (reference "good" clients) |
| `sessions-overview-2026-05-18_22.csv` | Updated roster week |
| `sessions-with-feedback-status-2026-05-13_19.csv` | Same slots + `overview_status` / `feedback_complete` as Portal admin |
| `sessions-with-feedback-status-2026-05-18_22.csv` | Same for 18–22 May |
| `session-feedback.csv` | All feedback rows from 2026-05-11 |
| `incidents.csv` | Incident reports |
| `cancellations.csv` | Cancellations |
| `absents.csv` | Absent quick marks |

## Join keys

- `session_key` / `portal_session_key` / `feedback_unit_key`
- `session_date` + `client_name` (+ `session_time` for aquatic)

## Notes column

`notes` = pool/room/hub area (Portal overview "Notes"), not free-text staff notes.

Generated: 2026-05-20T08:58:37.825Z
