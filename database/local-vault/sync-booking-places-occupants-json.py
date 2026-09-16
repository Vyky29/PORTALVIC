#!/usr/bin/env python3
"""Regenerate Edge Places twin from portal_capacity_chain_occupants.js (B2).

  python3 database/local-vault/sync-booking-places-occupants-json.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "working_ui/portal/portal_capacity_chain_occupants.js"
OUT = ROOT / "supabase/functions/_shared/portal_capacity_chain_places_occupants.json"
PLACES = {"aquatic", "climbing", "physical", "multi"}


def main() -> None:
    t = SRC.read_text(encoding="utf-8")
    marker = "window.PORTAL_CAPACITY_CHAIN_OCCUPANTS = "
    idx = t.find(marker)
    if idx < 0:
        raise SystemExit("occupants marker not found")
    data = json.loads(t[idx + len(marker) :].strip().rstrip(";"))
    by = {}
    for sid, s in (data.get("bySlotId") or {}).items():
        if str(s.get("serviceId") or "").lower() not in PLACES:
            continue
        lines = []
        for line in s.get("seatLines") or []:
            lines.append(
                {
                    "kind": line.get("kind"),
                    "client": line.get("client"),
                    "instructor": line.get("instructor"),
                    "trialDate": line.get("trialDate") or line.get("trial_date"),
                    "trialClient": line.get("trialClient") or line.get("trial_client"),
                }
            )
        by[sid] = {
            "serviceId": s.get("serviceId"),
            "day": s.get("day"),
            "venue": s.get("venue"),
            "timeLabel": s.get("timeLabel"),
            "capacity": s.get("capacity"),
            "taken": s.get("taken"),
            "openSeats": s.get("openSeats"),
            "instructors": s.get("instructors") or [],
            "openInstructors": s.get("openInstructors") or [],
            "bookedNames": s.get("bookedNames") or [],
            "seatLines": lines,
        }
    out = {
        "generatedFrom": "working_ui/portal/portal_capacity_chain_occupants.js",
        "note": "Places-only twin for portal-booking-offer B2. Run sync-booking-places-occupants-json.py after Places seat edits.",
        "bySlotId": by,
    }
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} slots={len(by)}")


if __name__ == "__main__":
    main()
