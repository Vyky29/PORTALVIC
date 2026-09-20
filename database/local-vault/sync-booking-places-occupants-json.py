#!/usr/bin/env python3
"""Regenerate Edge capacity-chain occupants twins from portal_capacity_chain_occupants.js.

  python3 database/local-vault/sync-booking-places-occupants-json.py

Writes:
  - Places-only JSON for portal-booking-offer (B2)
  - Full standing JSON for parent-portal-participant-detail (B3)
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "working_ui/portal/portal_capacity_chain_occupants.js"
OUT_PLACES = ROOT / "supabase/functions/_shared/portal_capacity_chain_places_occupants.json"
OUT_STANDING = ROOT / "supabase/functions/_shared/portal_capacity_chain_standing_occupants.json"
PLACES = {"aquatic", "climbing", "physical", "multi"}


def _load_occupants() -> dict:
    t = SRC.read_text(encoding="utf-8")
    marker = "window.PORTAL_CAPACITY_CHAIN_OCCUPANTS = "
    idx = t.find(marker)
    if idx < 0:
        raise SystemExit("occupants marker not found")
    return json.loads(t[idx + len(marker) :].strip().rstrip(";"))


def _seat_line(line: dict, *, places: bool) -> dict:
    out = {
        "kind": line.get("kind"),
        "client": line.get("client"),
        "instructor": line.get("instructor"),
        "trialDate": line.get("trialDate") or line.get("trial_date"),
        "trialClient": line.get("trialClient") or line.get("trial_client"),
    }
    if not places:
        out["bookedFrom"] = line.get("bookedFrom") or line.get("booked_from")
    return out


def main() -> None:
    data = _load_occupants()
    places_by = {}
    standing_by = {}
    for sid, s in (data.get("bySlotId") or {}).items():
        lines_standing = [_seat_line(line, places=False) for line in (s.get("seatLines") or [])]
        standing_by[sid] = {
            "serviceId": s.get("serviceId"),
            "day": s.get("day"),
            "venue": s.get("venue"),
            "timeLabel": s.get("timeLabel"),
            "seatLines": lines_standing,
        }
        if str(s.get("serviceId") or "").lower() not in PLACES:
            continue
        places_by[sid] = {
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
            "seatLines": [_seat_line(line, places=True) for line in (s.get("seatLines") or [])],
        }

    places_out = {
        "generatedFrom": "working_ui/portal/portal_capacity_chain_occupants.js",
        "note": "Places-only twin for portal-booking-offer B2. Run sync-booking-places-occupants-json.py after Places seat edits.",
        "bySlotId": places_by,
    }
    standing_out = {
        "generatedFrom": "working_ui/portal/portal_capacity_chain_occupants.js",
        "note": "Full standing twin for parent hub B3. Run sync-booking-places-occupants-json.py after occupants seat edits.",
        "bySlotId": standing_by,
    }
    OUT_PLACES.write_text(
        json.dumps(places_out, separators=(",", ":"), ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    out_ts = OUT_PLACES.with_suffix(".ts")
    out_ts.write_text(
        "// Generated from portal_capacity_chain_places_occupants.json. Do not edit by hand.\n"
        "const placesOccupants = "
        + json.dumps(places_out, ensure_ascii=True, separators=(",", ":"))
        + " as {\n"
        "  generatedFrom?: string;\n"
        "  note?: string;\n"
        "  bySlotId: Record<string, unknown>;\n"
        "};\n"
        "export default placesOccupants;\n",
        encoding="utf-8",
    )
    OUT_STANDING.write_text(
        json.dumps(standing_out, separators=(",", ":"), ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT_PLACES.relative_to(ROOT)} slots={len(places_by)}")
    print(f"wrote {out_ts.relative_to(ROOT)}")
    print(f"wrote {OUT_STANDING.relative_to(ROOT)} slots={len(standing_by)}")


if __name__ == "__main__":
    main()
