# -*- coding: utf-8 -*-
"""Import working_ui/portal-import-bundle (or database/portal_import_bundle) into Portal static assets.

Reads FEEDBACK-COMPLETION-LOGIC.md: week strip + overview use sessions-with-feedback-status-*.csv
(required = overview slot rows per day; completed = feedback_complete yes OR overview_status absent).

  python database/import_portal_bundle.py
"""
from __future__ import annotations

import csv
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE_SRC = ROOT / "working_ui" / "portal-import-bundle"
BUNDLE_CANON = ROOT / "database" / "portal_import_bundle"
ROSTER_WEEKS = ROOT / "database" / "roster_weeks"
PORTAL = ROOT / "working_ui" / "portal"
FEEDBACK_JS = PORTAL / "session_feedback_portal_data.js"
STATUS_JS = PORTAL / "session_feedback_status_portal_data.js"
CANCELLATIONS_JS = PORTAL / "cancellations_portal_data.js"
FEEDBACK_IMPORTS = ROOT / "database" / "feedback_imports"

# Drop legacy per-tramo CSVs; bundle replaces them.
LEGACY_FEEDBACK_CSV = [
    ROOT / "working_ui" / "session-feedback-from-2026-05-11.csv",
]
LEGACY_OVERVIEW_CSV = list(ROSTER_WEEKS.glob("sessions-overview-*.csv")) if ROSTER_WEEKS.is_dir() else []


def sync_bundle_to_canon() -> Path:
    if not BUNDLE_SRC.is_dir():
        raise SystemExit(f"Missing bundle folder: {BUNDLE_SRC}")
    if BUNDLE_CANON.exists():
        shutil.rmtree(BUNDLE_CANON)
    shutil.copytree(BUNDLE_SRC, BUNDLE_CANON)
    return BUNDLE_CANON


def remove_legacy_csvs() -> None:
    for p in LEGACY_FEEDBACK_CSV:
        if p.is_file():
            p.unlink()
            print("Removed legacy", p.relative_to(ROOT))
    for p in LEGACY_OVERVIEW_CSV:
        if p.is_file():
            p.unlink()
            print("Removed legacy", p.relative_to(ROOT))


def copy_overview_to_roster_weeks(bundle: Path) -> list[Path]:
    ROSTER_WEEKS.mkdir(parents=True, exist_ok=True)
    mapping = {
        "sessions-overview-2026-05-13_19.csv": "summer-term-2026-week-2026-05-13_2026-05-19.csv",
        "sessions-overview-2026-05-18_22.csv": "summer-term-2026-week-2026-05-18_2026-05-22.csv",
    }
    out: list[Path] = []
    for src_name, dest_name in mapping.items():
        src = bundle / src_name
        if not src.is_file():
            continue
        dest = ROSTER_WEEKS / dest_name
        shutil.copy2(src, dest)
        out.append(dest)
        print("Roster week", dest.relative_to(ROOT))
    return out


def import_feedback_js(bundle: Path) -> int:
    from import_session_feedback_csv import (
        FIRST_DATE,
        _dates_in_bundle_feedback,
        dedupe_key,
        load_baseline_rows,
        read_xlsx_rows,
        row_from_dict,
    )

    fb_csv = bundle / "session-feedback.csv"
    bundle_dates = _dates_in_bundle_feedback(fb_csv) if fb_csv.is_file() else set()

    by_key: dict[tuple, dict] = {}
    baseline, baseline_src = load_baseline_rows(allow_existing_js=False)
    for row in baseline:
        d = str(row.get("date") or "")
        if d < FIRST_DATE or d >= "2026-05-11" or d in bundle_dates:
            continue
        by_key[dedupe_key(row)] = row

    if fb_csv.is_file():
        reader = csv.DictReader(fb_csv.read_text(encoding="utf-8-sig").splitlines())
        for raw in reader:
            row = row_from_dict(raw, fb_csv.name)
            if not row:
                continue
            row.pop("_source", None)
            by_key[dedupe_key(row)] = row

    for xlsx in sorted(FEEDBACK_IMPORTS.glob("*.xlsx")):
        for row in read_xlsx_rows(xlsx):
            d = str(row.get("date") or "")
            if d < "2026-04-30" or d > "2026-05-10" or d in bundle_dates:
                continue
            by_key[dedupe_key(row)] = row

    rows = sorted(by_key.values(), key=lambda r: (r["date"], r["clientName"] or ""), reverse=True)
    dates = sorted({r["date"] for r in rows})
    meta = {
        "sourceFile": f"{baseline_src} + portal_import_bundle/session-feedback.csv",
        "sheet": "portal-import-bundle",
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "rowCount": len(rows),
        "coverageFromIso": FIRST_DATE,
        "coverageThroughIso": dates[-1] if dates else None,
        "sourceNote": "v1 Apr 13-30 + bundle session-feedback from 2026-05-11; status CSV drives awaiting/submitted UI",
    }
    payload = {"meta": meta, "rows": rows}
    FEEDBACK_JS.parent.mkdir(parents=True, exist_ok=True)
    with FEEDBACK_JS.open("w", encoding="utf-8") as f:
        f.write("window.SESSION_FEEDBACK_PORTAL_SOURCE = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"Wrote {FEEDBACK_JS.relative_to(ROOT)} rows={len(rows)}")
    return len(rows)


def _status_row_key(raw: dict) -> tuple:
    """One overview row per date + client + time_slot (Day Centre blocks stay separate)."""
    date_iso = str(raw.get("date") or "").strip()[:10]
    return (
        date_iso,
        str(raw.get("client") or "").strip().lower(),
        str(raw.get("time_slot") or "").strip().lower(),
    )


def export_cancellations_js(bundle: Path) -> int:
    path = bundle / "cancellations.csv"
    rows_out: list[dict] = []
    if path.is_file():
        for raw in csv.DictReader(path.read_text(encoding="utf-8-sig").splitlines()):
            name = str(raw.get("client_name") or "").strip()
            if not name or re.match(r"^test\s*client$", name, re.I):
                continue
            rows_out.append(
                {
                    "session_date": str(raw.get("session_date") or "")[:10],
                    "client_name": name,
                    "service": str(raw.get("service") or "").strip(),
                    "session_time": str(raw.get("session_time") or "").strip(),
                    "cancellation_timing": str(raw.get("cancellation_timing") or "").strip(),
                    "reason_category": str(raw.get("reason_category") or "").strip(),
                    "submitted_by_name": str(raw.get("submitted_by_name") or "").strip(),
                    "portal_session_key": str(raw.get("portal_session_key") or "").strip(),
                    "created_at": str(raw.get("created_at") or "").strip(),
                }
            )
    rows_out.sort(
        key=lambda r: (r["session_date"], r.get("client_name") or ""),
        reverse=True,
    )
    meta = {
        "sourceFile": "portal-import-bundle/cancellations.csv",
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "rowCount": len(rows_out),
    }
    payload = {"meta": meta, "rows": rows_out}
    CANCELLATIONS_JS.parent.mkdir(parents=True, exist_ok=True)
    with CANCELLATIONS_JS.open("w", encoding="utf-8") as f:
        f.write("window.CANCELLATIONS_PORTAL_SOURCE = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"Wrote {CANCELLATIONS_JS.relative_to(ROOT)} rows={len(rows_out)}")
    return len(rows_out)


def export_status_js(bundle: Path) -> int:
    by_key: dict[tuple, dict] = {}
    sources: list[str] = []
    for path in sorted(bundle.glob("sessions-with-feedback-status-*.csv")):
        sources.append(path.name)
        reader = csv.DictReader(path.read_text(encoding="utf-8-sig").splitlines())
        for raw in reader:
            date_iso = str(raw.get("date") or "").strip()[:10]
            if not date_iso:
                continue
            oc = str(raw.get("overview_status") or "").strip()
            fc = str(raw.get("feedback_complete") or "").strip().lower() == "yes"
            row = {
                "date": date_iso,
                "weekday": str(raw.get("weekday") or "").strip() or None,
                "client": str(raw.get("client") or "").strip(),
                "service": str(raw.get("service") or "").strip(),
                "timeSlot": str(raw.get("time_slot") or "").strip(),
                "instructor": str(raw.get("instructor") or "").strip(),
                "venue": str(raw.get("venue") or "").strip(),
                "notes": str(raw.get("notes") or "").strip(),
                "sessionKey": str(raw.get("session_key") or "").strip(),
                "feedbackUnitKey": str(raw.get("feedback_unit_key") or "").strip(),
                "feedbackMergeGroup": str(raw.get("feedback_merge_group") or "").strip() or None,
                "overviewStatus": oc,
                "feedbackComplete": fc,
                "matchedFeedbackClient": str(raw.get("matched_feedback_client") or "").strip() or None,
                "matchedFeedbackBy": str(raw.get("matched_feedback_by") or "").strip() or None,
                "matchedPortalSessionKey": str(raw.get("matched_portal_session_key") or "").strip() or None,
            }
            by_key[_status_row_key(raw)] = row

    rows_out = sorted(by_key.values(), key=lambda r: (r["date"], r.get("timeSlot") or "", r.get("client") or ""))
    meta = {
        "sourceFiles": sources,
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "rowCount": len(rows_out),
        "logicDoc": "portal-import-bundle/FEEDBACK-COMPLETION-LOGIC.md",
        "sourceNote": "Trust overview_status / feedback_complete; absent counts as done",
    }
    payload = {"meta": meta, "rows": rows_out}
    with STATUS_JS.open("w", encoding="utf-8") as f:
        f.write("window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"Wrote {STATUS_JS.relative_to(ROOT)} rows={len(rows_out)}")
    return len(rows_out)


def import_roster_and_bundle() -> None:
    from import_roster_week_csv import import_all_roster_weeks

    n = import_all_roster_weeks()
    print(f"Merged {n} dated roster rows into staff_clients_machine.json")

    try:
        import build_machine_exports as bme

        bme.patch_bundle_rows_from_json()
        bme.copy_spreadsheet_js_to_working_ui()
        print("Patched staff_dashboard_spreadsheet_bundle.js from staff_clients_machine.json")
    except Exception as e:
        print("bundle patch skipped:", e)


def main() -> None:
    remove_legacy_csvs()
    bundle = sync_bundle_to_canon()
    copy_overview_to_roster_weeks(bundle)
    import_feedback_js(bundle)
    from reconcile_feedback_status_bundle import reconcile_bundle

    reconcile_bundle(bundle)
    for status_csv in bundle.glob("sessions-with-feedback-status-*.csv"):
        shutil.copy2(status_csv, BUNDLE_SRC / status_csv.name)
    export_status_js(bundle)
    export_cancellations_js(bundle)
    from export_venue_reviews_portal_js import export_venue_reviews_js

    export_venue_reviews_js()
    import_roster_and_bundle()
    print("Done. Deploy working_ui/portal/*.js and refresh admin with cache-bust query.")


if __name__ == "__main__":
    main()
