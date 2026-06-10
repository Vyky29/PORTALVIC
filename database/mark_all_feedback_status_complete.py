# -*- coding: utf-8 -*-
"""Mark all sessions-with-feedback-status rows complete (except absent) and re-export status JS.

Use while historical feedback is being audited — staff dashboards stop showing orange
pending sessions until real gaps are re-opened in the bundle CSVs.

  python database/mark_all_feedback_status_complete.py
"""
from __future__ import annotations

import csv
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE_SRC = ROOT / "working_ui" / "portal-import-bundle"
BUNDLE_CANON = ROOT / "database" / "portal_import_bundle"
STATUS_JS = ROOT / "working_ui" / "portal" / "session_feedback_status_portal_data.js"
STATUS_JS_SHARED = ROOT / "working_ui" / "portal-shared-js" / "session_feedback_status_portal_data.js"


def mark_bundle_complete(bundle: Path) -> int:
    changed = 0
    for path in sorted(bundle.glob("sessions-with-feedback-status-*.csv")):
        text = path.read_text(encoding="utf-8-sig")
        reader = csv.DictReader(text.splitlines())
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)
        for row in rows:
            date_iso = str(row.get("date") or "").strip()[:10]
            if date_iso >= "2026-06-09":
                continue
            oc = str(row.get("overview_status") or "").strip().lower()
            if oc == "absent":
                continue
            if str(row.get("feedback_complete") or "").strip().lower() != "yes":
                row["feedback_complete"] = "yes"
                changed += 1
            if oc not in ("feedback_submitted", "absent"):
                row["overview_status"] = "feedback_submitted"
                changed += 1
        with path.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
        print("Updated", path.relative_to(ROOT), "rows=", len(rows))
    return changed


def main() -> None:
    bundle = BUNDLE_SRC if BUNDLE_SRC.is_dir() else BUNDLE_CANON
    if not bundle.is_dir():
        raise SystemExit(f"Missing bundle: {BUNDLE_SRC}")
    n = mark_bundle_complete(bundle)
    if BUNDLE_CANON.is_dir():
        mark_bundle_complete(BUNDLE_CANON)
    from import_portal_bundle import export_status_js

    export_status_js(bundle)
    if STATUS_JS.is_file() and STATUS_JS_SHARED.parent.is_dir():
        shutil.copy2(STATUS_JS, STATUS_JS_SHARED)
        print("Copied", STATUS_JS_SHARED.relative_to(ROOT))
    print("Done. Changed fields on", n, "row passes. Bump ?v= on dashboard script tags.")


if __name__ == "__main__":
    main()
