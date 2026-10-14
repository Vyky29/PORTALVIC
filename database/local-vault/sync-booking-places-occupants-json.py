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


def _phase_fields(slot: dict) -> dict:
    out = {}
    for key in ("validFrom", "validTo", "phase"):
        val = slot.get(key)
        if val:
            out[key] = val
    return out


def _seat_line(line: dict, *, places: bool) -> dict:
    out = {
        "kind": line.get("kind"),
        "client": line.get("client"),
        "instructor": line.get("instructor"),
        "trialDate": line.get("trialDate") or line.get("trial_date"),
        "trialClient": line.get("trialClient") or line.get("trial_client"),
    }
    if places and line.get("offerOpen"):
        # Standing still names the child (parent chips). Places treats the seat as free.
        out["kind"] = "open"
        out["client"] = None
    if not places:
        out["bookedFrom"] = line.get("bookedFrom") or line.get("booked_from")
        until = line.get("bookedUntil") or line.get("booked_until")
        if until:
            out["bookedUntil"] = until
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
            **_phase_fields(s),
            "seatLines": lines_standing,
        }
        if str(s.get("serviceId") or "").lower() not in PLACES:
            continue
        place_lines = [_seat_line(line, places=True) for line in (s.get("seatLines") or [])]
        offer_open = any(line.get("offerOpen") for line in (s.get("seatLines") or []))
        booked_names = []
        open_instructors = []
        if offer_open:
            for line in place_lines:
                kind = str(line.get("kind") or "")
                client = line.get("client")
                if kind in ("booked", "hold", "closed") and client:
                    booked_names.append(client)
                elif kind == "open" and line.get("instructor"):
                    open_instructors.append(str(line.get("instructor")).upper())
            taken = len([line for line in place_lines if str(line.get("kind") or "") != "open"])
            capacity = s.get("capacity") if isinstance(s.get("capacity"), int) else len(place_lines)
            open_seats = max(0, capacity - taken)
        else:
            booked_names = list(s.get("bookedNames") or [])
            open_instructors = list(s.get("openInstructors") or [])
            taken = s.get("taken")
            capacity = s.get("capacity")
            open_seats = s.get("openSeats")
        places_by[sid] = {
            "serviceId": s.get("serviceId"),
            "day": s.get("day"),
            "venue": s.get("venue"),
            "timeLabel": s.get("timeLabel"),
            **_phase_fields(s),
            "capacity": capacity,
            "taken": taken,
            "openSeats": open_seats,
            "instructors": s.get("instructors") or [],
            "openInstructors": open_instructors,
            "bookedNames": booked_names,
            "seatLines": place_lines,
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
