#!/usr/bin/env python3
"""Wire Teflon as the portal guide demo account (auth stf020).

Guide roster for photos lives in working_ui/portal/teflon_guide_demo_data.js (Teflon login only).
Do not patch STAFF_DASHBOARD_SOURCE bundles — that would leak demo clients into other staff dashboards.
"""
from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "database"

# Guide clients: Mari Trini, Sam, Vitin, Jordan — Mon 2026-06-01 showcase (all colours on one day).
TEFLON_MONDAY_SHOWCASE = "2026-06-01"
TEFLON_DEMO_ROWS = [
    {
        "client_name": "Mari Trini",
        "day": "Monday",
        "instructors": "TEFLON",
        "service": "Aquatic Activity",
        "area": "Teaching Pool",
        "time_slot": "9 to 10",
        "venue": "Acton",
        "session_date": TEFLON_MONDAY_SHOWCASE,
    },
    {
        "client_name": "Vitin",
        "day": "Monday",
        "instructors": "TEFLON",
        "service": "Bespoke Programme",
        "area": "Client's Home",
        "time_slot": "10 to 11",
        "venue": "Chelsea",
        "session_date": TEFLON_MONDAY_SHOWCASE,
    },
    {
        "client_name": "Sam",
        "day": "Monday",
        "instructors": "TEFLON",
        "service": "Multi-Activity",
        "area": "Hub Room",
        "time_slot": "11 to 12",
        "venue": "SwimFarm",
        "session_date": TEFLON_MONDAY_SHOWCASE,
    },
    {
        "client_name": "Jordan",
        "day": "Monday",
        "instructors": "TEFLON",
        "service": "Aquatic Activity",
        "area": "Teaching Pool",
        "time_slot": "2 to 3",
        "venue": "Northolt",
        "session_date": TEFLON_MONDAY_SHOWCASE,
    },
    {
        "client_name": "Sam",
        "day": "Tuesday",
        "instructors": "TEFLON",
        "service": "Multi-Activity",
        "area": "Hub Room",
        "time_slot": "2 to 3",
        "venue": "SwimFarm",
        "session_date": "2026-05-27",
    },
    {
        "client_name": "Jordan",
        "day": "Sunday",
        "instructors": "TEFLON",
        "service": "Aquatic Activity",
        "area": "Teaching Pool",
        "time_slot": "10 to 11",
        "venue": "Northolt",
        "session_date": "2026-05-25",
    },
]

TEFLON_DEMO_CLIENT_NAMES = {
    "Alex Demo",
    "Sam Demo",
    "Jordan Demo",
    "Mari Trini",
    "Sam",
    "Vitin",
    "Jordan",
}

TEFLON_CLIENTS_INFO = [
    {
        "client_name": "Mari Trini",
        "client_info": (
            "1. Goals: Build water confidence and independent entry.\n"
            "2. Medical: None.\n"
            "3. Communication: Uses visuals and short phrases."
        ),
    },
    {
        "client_name": "Sam",
        "client_info": (
            "1. Goals: Social participation in group activities.\n"
            "2. Medical: None known.\n"
            "3. Communication: Verbal — prefers calm, step-by-step instructions."
        ),
    },
    {
        "client_name": "Vitin",
        "client_info": (
            "1. Goals: Maintain mobility and routine through home-based bespoke sessions.\n"
            "2. Medical: None known.\n"
            "3. Communication: Verbal — family present at home visits."
        ),
    },
    {
        "client_name": "Jordan",
        "client_info": (
            "1. Goals: Improve pool entry routine and floating.\n"
            "2. Medical: Epilepsy — emergency medication in bag; staff briefed on seizure protocol.\n"
            "3. Communication: Non-verbal; responds to gestures and picture cards."
        ),
    },
]

TEFLON_PROFILE = {
    "staffId": "teflon",
    "staffName": "Teflon",
    "avatarFile": "portal/staff_photos/teflon.png",
    "staffRoleTrack": "swimming",
    "canViewAll": False,
}

BUNDLE_PATHS = [
    DATABASE / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "portal" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "portal-shared-js" / "staff_dashboard_spreadsheet_bundle.js",
]


def is_teflon_demo_row(row: dict) -> bool:
    if str(row.get("instructors") or "").strip().upper() != "TEFLON":
        return False
    name = str(row.get("client_name") or "").strip()
    if name in TEFLON_DEMO_CLIENT_NAMES:
        return True
    return " Demo" in name or name.endswith("Demo")


def extract_bundle_payload(text: str) -> dict:
    m = re.search(
        r"window\.STAFF_DASHBOARD_SOURCE\s*=\s*(\{.*\})\s*;\s*\n\}\)\(\);",
        text,
        re.DOTALL,
    )
    if not m:
        raise SystemExit("Could not parse STAFF_DASHBOARD_SOURCE JSON")
    return json.loads(m.group(1))


def render_bundle(payload: dict) -> str:
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    return (
        "(function () {\n"
        "  // Source consumed by staff_dashboard_spreadsheet_adapter.js\n"
        f"  window.STAFF_DASHBOARD_SOURCE = {body};\n"
        "})();\n"
    )


def patch_bundle_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    payload = extract_bundle_payload(text)
    profiles = payload.setdefault("staffProfiles", {})
    profiles.pop("demo", None)
    profiles["teflon"] = TEFLON_PROFILE

    payload["clientsInfo"] = deepcopy(TEFLON_CLIENTS_INFO)

    rows = [r for r in payload.get("rows") or [] if not is_teflon_demo_row(r)]
    rows.extend(deepcopy(TEFLON_DEMO_ROWS))
    payload["rows"] = rows

    path.write_text(render_bundle(payload), encoding="utf-8", newline="\n")


def patch_machine_json() -> int:
    path = DATABASE / "staff_clients_machine.json"
    rows = json.loads(path.read_text(encoding="utf-8"))
    before = len(rows)
    rows = [r for r in rows if not is_teflon_demo_row(r)]
    rows.extend(deepcopy(TEFLON_DEMO_ROWS))
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(rows) - before


def main() -> None:
    print(
        "Skipped bundle/machine patch — edit working_ui/portal/teflon_guide_demo_data.js instead."
    )
    print("Auth/SQL: supabase/migrations/20260608160000_portal_teflon_demo_account.sql")


if __name__ == "__main__":
    main()
