# Portal terminology (UI vs backend)

## Rule

- **User-facing copy** in `working_ui/` uses **participant / participants** for people who receive services (historically “client”, “student”, or generic “user” in labels).
- **Backend** (Supabase, URLs, JSON keys, roster adapters) may still use **`client`**, `client_id`, `client_name`, `kind: 'client'`, query params like `?clientId=`, etc. Do not rename those without coordinated API and migration work.

## What we did not rename

- DOM ids and CSS class names containing `client` (e.g. `clientSheet`, `clientsSheet`, `session-cell--client`) — wiring and styles depend on them.
- Spreadsheet / roster parsing that matches literal status text such as `no client` from source data.
- Supabase column names and insert payloads (`client_id`, `client_name`, …).
- External script URLs such as `clients_info_embed.js` (hosted asset name).

## Files touched for copy (summary)

- `lead_dashboard.html`, `staff_dashboard.html` — dock, sheets, chips, empty states, aria-labels, roster display strings.
- `admin_dashboard.html` — demo tables, CEO KPI copy, placeholders.
- `session_feedback.html` — emotion section labels and context row prefix.
- `cancellation_report.html`, `incident_report.html` — validation message text.
- `lead_feedback_report_app.js` — context summary labels (payload fields unchanged).

When adding new UI strings, default to **participant** unless the sentence is about a **staff user** (logged-in account) or a **technical user id**.
