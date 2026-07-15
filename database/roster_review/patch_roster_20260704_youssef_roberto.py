# -*- coding: utf-8 -*-
"""Align MADRE + bundles: Roberto Timi Mon; Youssef Emanuel/Fadi Jul 6/8/10."""
from __future__ import annotations

import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
SYNC = ROOT / "database" / "roster_review" / "sync_roster_madre_to_portal.py"

MON = "2026-07-06"
WED = "2026-07-08"
FRI = "2026-07-10"


def clean(s) -> str:
    return str(s or "").strip()


def slot_client(slot: dict) -> str:
    return clean(slot.get("client_name")).lower()


def slot_time(slot: dict) -> str:
    return clean(slot.get("time_slot")).lower().replace(",", ".")


def find_timi_template(seed: dict) -> dict:
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            for d in st.get("days", []):
                for s in d.get("slots") or []:
                    if clean(s.get("client_name")).lower() == "timi":
                        return deepcopy(s)
    raise SystemExit("Timi template slot not found in MADRE")


def find_emanuel_info(seed: dict) -> str:
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            if st.get("staffKey") != "michelle":
                continue
            for d in st.get("days", []):
                for s in d.get("slots") or []:
                    if clean(s.get("client_name")).lower() == "emanuel":
                        return clean(s.get("participant_info"))
    return ""


def hub_slot(client: str, time_slot: str, service: str, area: str, info: str) -> dict:
    return {
        "time_slot": time_slot,
        "client_name": client,
        "service": service,
        "area": area,
        "pool_note": area,
        "venue": "SwimFarm",
        "instructors": "YOUSSEF",
        "participant_info": info,
    }


def remove_matching(slots: list[dict], client: str, time_prefix: str | None = None) -> list[dict]:
    out = []
    for s in slots:
        if slot_client(s) != client.lower():
            out.append(s)
            continue
        if time_prefix and not slot_time(s).startswith(time_prefix.lower()):
            out.append(s)
    return out


def insert_after_client(slots: list[dict], after_client: str, new_slot: dict) -> list[dict]:
    out: list[dict] = []
    inserted = False
    for s in slots:
        out.append(s)
        if not inserted and slot_client(s) == after_client.lower():
            out.append(deepcopy(new_slot))
            inserted = True
    if not inserted:
        out.append(deepcopy(new_slot))
    return out


def patch_roberto_monday(slots: list[dict], timi_template: dict) -> list[dict]:
    has_acat = any(slot_client(s) == "acat" for s in slots)
    has_timi = any(slot_client(s) == "timi" for s in slots)
    if not has_acat or has_timi:
        return slots
    timi = deepcopy(timi_template)
    timi["time_slot"] = "12 to 12.30"
    timi["instructors"] = "ROBERTO"
    return insert_after_client(slots, "acat", timi)


def patch_youssef_monday(slots: list[dict], emanuel_info: str) -> list[dict]:
    slots = [s for s in slots if not (slot_client(s) == "ikram" and slot_time(s).startswith("11"))]
    slots = [
        s
        for s in slots
        if not (
            slot_client(s) == "emanuel"
            and ("12,30" in clean(s.get("time_slot")) or "12.30" in slot_time(s))
        )
    ]
    emanuel_hub = hub_slot("Emanuel", "11 to 12", "Day Centre", "Hub Room", emanuel_info)
    emanuel_swim = hub_slot("Emanuel", "12 to 1", "Aquatic Activity", "Big pool", emanuel_info)
    emanuel_swim["area"] = "Big pool"
    emanuel_swim["pool_note"] = "Big pool"
    # Keep Fadi 1.30-3; prepend Emanuel blocks before Fadi or after any remaining morning slot.
    out: list[dict] = []
    inserted = False
    for s in slots:
        if not inserted and slot_client(s) == "fadi":
            out.extend([emanuel_hub, emanuel_swim])
            inserted = True
        out.append(s)
    if not inserted:
        out = [emanuel_hub, emanuel_swim] + out
    return out


def patch_youssef_wed_fri(slots: list[dict], emanuel_info: str) -> list[dict]:
    slots = [s for s in slots if not (slot_client(s) == "ikram")]
    has_fadi = any(slot_client(s) == "fadi" for s in slots)
    emanuel_hub = hub_slot("Emanuel", "11 to 12", "Day Centre", "Hub Room", emanuel_info)
    emanuel_swim = hub_slot("Emanuel", "12 to 1", "Aquatic Activity", "Big pool", emanuel_info)
    emanuel_swim["area"] = "Big pool"
    emanuel_swim["pool_note"] = "Big pool"
    fadi = hub_slot("Fadi", "1.30 to 3", "Day Centre", "Hub Room", emanuel_info)
    if not has_fadi:
        slots = [emanuel_hub, emanuel_swim, fadi] + slots
    else:
        out: list[dict] = []
        inserted = False
        for s in slots:
            if not inserted and slot_client(s) == "fadi":
                out.extend([emanuel_hub, emanuel_swim])
                inserted = True
            out.append(s)
        slots = out if inserted else [emanuel_hub, emanuel_swim] + slots
    return slots


def patch_michelle_monday(slots: list[dict]) -> list[dict]:
    return [
        s
        for s in slots
        if not (slot_client(s) == "emanuel" and slot_time(s).startswith("11"))
    ]


def patch_michelle_wed_fri(slots: list[dict]) -> list[dict]:
    return [s for s in slots if slot_client(s) != "emanuel"]


def patch_madre(seed: dict) -> dict:
    timi_template = find_timi_template(seed)
    emanuel_info = find_emanuel_info(seed)
    stats = {"roberto_monday": 0, "youssef": 0, "michelle": 0}

    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            key = st.get("staffKey")
            for d in st.get("days", []):
                date = clean(d.get("sessionDate"))
                weekday = clean(d.get("weekday"))
                slots = d.get("slots") or []

                if key == "roberto" and weekday == "Monday":
                    new_slots = patch_roberto_monday(slots, timi_template)
                    if new_slots != slots:
                        stats["roberto_monday"] += 1
                        d["slots"] = new_slots

                elif key == "youssef" and date == MON:
                    new_slots = patch_youssef_monday(slots, emanuel_info)
                    if new_slots != slots:
                        stats["youssef"] += 1
                        d["slots"] = new_slots

                elif key == "youssef" and date in (WED, FRI):
                    new_slots = patch_youssef_wed_fri(slots, emanuel_info)
                    if new_slots != slots:
                        stats["youssef"] += 1
                        d["slots"] = new_slots

                elif key == "michelle" and date == MON:
                    new_slots = patch_michelle_monday(slots)
                    if new_slots != slots:
                        stats["michelle"] += 1
                        d["slots"] = new_slots

                elif key == "michelle" and date in (WED, FRI):
                    new_slots = patch_michelle_wed_fri(slots)
                    if new_slots != slots:
                        stats["michelle"] += 1
                        d["slots"] = new_slots

    return stats


def main() -> None:
    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    stats = patch_madre(seed)
    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Patched MADRE: {stats}")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
