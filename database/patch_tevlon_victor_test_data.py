#!/usr/bin/env python3
"""Add Victor / Tevlon 10–11 Mon–Fri sessions and outstanding feedback rows for portal testing."""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "working_ui" / "portal" / "staff_dashboard_spreadsheet_bundle.js"
STATUS = ROOT / "working_ui" / "portal" / "session_feedback_status_portal_data.js"

# Last week Mon–Fri (from Tue 2026-05-19) + this week Mon–Fri
ISO_DATES = [
    "2026-05-11",
    "2026-05-12",
    "2026-05-13",
    "2026-05-14",
    "2026-05-15",
    "2026-05-18",
    "2026-05-19",
    "2026-05-20",
    "2026-05-21",
    "2026-05-22",
]


def weekday_en(iso: str) -> str:
    return date.fromisoformat(iso).strftime("%A")


def roster_row(iso: str) -> dict:
    return {
        "client_name": "Tevlon",
        "day": weekday_en(iso),
        "instructors": "VICTOR",
        "service": "Bespoke Programme",
        "area": "Hub Room",
        "time_slot": "10 to 11",
        "venue": "SwimFarm",
        "session_date": iso,
    }


def status_row(iso: str) -> dict:
    sk = f"{iso}|10:00|tevlon|hub_room"
    return {
        "date": iso,
        "weekday": weekday_en(iso),
        "client": "Tevlon",
        "service": "Bespoke Programme",
        "timeSlot": "10 to 11",
        "instructor": "VICTOR",
        "venue": "SwimFarm",
        "notes": "Hub Room",
        "sessionKey": sk,
        "feedbackUnitKey": f"{iso}|tevlon|10:00|bespoke programme|hub_room",
        "feedbackMergeGroup": None,
        "overviewStatus": "awaiting_feedback",
        "feedbackComplete": False,
        "matchedFeedbackClient": None,
        "matchedFeedbackBy": None,
        "matchedPortalSessionKey": None,
    }


def patch_bundle() -> int:
    text = BUNDLE.read_text(encoding="utf-8")
    if '"client_name": "Tevlon"' in text and '"instructors": "VICTOR"' in text:
        # Already patched — skip duplicate inserts
        existing = text.count('"client_name": "Tevlon"')
        if existing >= len(ISO_DATES):
            return 0

    rows = [roster_row(iso) for iso in ISO_DATES]
    block = ",\n".join(
        "  " + json.dumps(r, ensure_ascii=False).replace("\n", "\n  ") for r in rows
    )
    marker = "\n]\n};"
    if marker not in text:
        raise SystemExit("bundle rows end marker not found")
    text = text.replace(marker, ",\n" + block + "\n]\n};", 1)
    BUNDLE.write_text(text, encoding="utf-8", newline="\n")
    return len(rows)


def patch_status() -> int:
    raw = STATUS.read_text(encoding="utf-8")
    m = re.search(
        r"window\.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE\s*=\s*(\{.*\})\s*;?\s*$",
        raw,
        re.DOTALL,
    )
    if not m:
        raise SystemExit("status JSON not found")
    data = json.loads(m.group(1))
    rows = data.setdefault("rows", [])
    existing_keys = {r.get("sessionKey") for r in rows}
    added = 0
    for iso in ISO_DATES:
        row = status_row(iso)
        if row["sessionKey"] in existing_keys:
            continue
        rows.append(row)
        added += 1
    rows.sort(key=lambda r: (r.get("date") or "", r.get("timeSlot") or ""))
    data["meta"]["rowCount"] = len(rows)
    data["meta"]["tevlonTestPatch"] = "victor-outstanding-feedback-2026-05"
    out = "window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE = " + json.dumps(
        data, ensure_ascii=False, separators=(",", ":")
    ) + ";\n"
    STATUS.write_text(out, encoding="utf-8", newline="\n")
    return added


def main() -> None:
    n_bundle = patch_bundle()
    n_status = patch_status()
    print(f"bundle: +{n_bundle} roster rows")
    print(f"status: +{n_status} awaiting_feedback rows")


if __name__ == "__main__":
    main()
