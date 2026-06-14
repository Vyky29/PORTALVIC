# -*- coding: utf-8 -*-
"""Inject feedback merge + staff overview omit rules into staff_dashboard_spreadsheet_bundle.js."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE_PATHS = [
    ROOT / "database" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "portal" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "portal-shared-js" / "staff_dashboard_spreadsheet_bundle.js",
]

# Regenerate from MADRE via database/roster_review/sync_roster_madre_to_portal.py
SUNDAY_FEEDBACK_MERGES = [
    {
        "day": "Wednesday",
        "client_name": "Cyrus",
        "instructors": "JAVIER",
        "mergeKey": "cyrus_javier_wed_swim",
        "slots": [
            {"time_slot": "4 to 4.30", "service": "Aquatic Activity"},
            {"time_slot": "4.30 to 5.15", "service": "Multi-Activity"},
        ],
    },
    {
        "day": "Sunday",
        "client_name": "Yusuf Ah",
        "instructors": "ROBERTO",
        "mergeKey": "yusuf_ah_roberto_sun_swim",
        "slots": [
            {"time_slot": "9 to 9.30", "service": "Aquatic Activity"},
            {"time_slot": "9.30 to 10.15", "service": "Multi-Activity"},
        ],
    },
]

OVERVIEW_OMIT_ROSTER_SLOTS = [
    {
        "weekday": "Wednesday",
        "client_slug": "cyrus",
        "time_slot": "4 to 4.30",
        "service": "Aquatic Activity",
    },
    {
        "weekday": "Sunday",
        "client_slug": "yusuf_ah",
        "time_slot": "9 to 9.30",
        "service": "Aquatic Activity",
    },
]


def _inject_after_key(src: str, after_key: str, json_blob: str) -> str:
    needle = f'"{after_key}":'
    i = src.find(needle)
    if i < 0:
        return src
    # insert before "rows":
    rows_i = src.find('"rows":', i)
    if rows_i < 0:
        return src
    return src[:rows_i] + json_blob + ",\n  " + src[rows_i:]


def _strip_existing_meta(src: str) -> str:
    for key in ("sundayFeedbackMerges", "overviewOmitRosterSlots"):
        pat = re.compile(
            r'\n  "' + re.escape(key) + r'":\s*\[[\s\S]*?\],?\n',
            re.MULTILINE,
        )
        src = pat.sub("\n", src)
    src = re.sub(r"\n    \}\n  \],\n", "\n", src)
    return src


def patch_bundle(path: Path) -> bool:
    if not path.exists():
        return False
    src = path.read_text(encoding="utf-8")
    src = _strip_existing_meta(src)
    meta = (
        '  "sundayFeedbackMerges": '
        + json.dumps(SUNDAY_FEEDBACK_MERGES, ensure_ascii=True, indent=2).replace("\n", "\n  ")
        + ',\n  "overviewOmitRosterSlots": '
        + json.dumps(OVERVIEW_OMIT_ROSTER_SLOTS, ensure_ascii=True, indent=2).replace("\n", "\n  ")
        + ",\n"
    )
    rows_i = src.find('"rows":')
    if rows_i < 0:
        return False
    new_src = src[:rows_i] + meta + "  " + src[rows_i:]
    path.write_text(new_src, encoding="utf-8")
    return True


def patch_all() -> int:
    n = 0
    for p in BUNDLE_PATHS:
        if patch_bundle(p):
            n += 1
            print(f"Patched feedback rules -> {p}")
    return n


if __name__ == "__main__":
    patch_all()
