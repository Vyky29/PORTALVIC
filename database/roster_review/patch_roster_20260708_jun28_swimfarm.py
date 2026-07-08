# -*- coding: utf-8 -*-
"""Correct SwimFarm Sunday 2026-06-28 in MADRE (what actually happened).

- DAN column → YOUSSEF (Dan did not work; Youssef covered)
- JAVIER pool column → LULIYA (Javier did not work; Luliya covered)
- 9:30–10:15 Big Pool: Samer, Yusuf Ah (Roberto 9–10:15), Adam Ab (Youssef)
- 9:30–10:15 Hub Room: Jack W (John), Jack S (Giuseppe), Zaid (Giuseppe)
- Remove Bismark Samer hub 9:30; Jack S moves from Javier Big Pool to Giuseppe Hub
- Roberto keeps a single merged Yusuf Ah 9 to 10.15 (no duplicate 9:30 slot)

  python database/roster_review/patch_roster_20260708_jun28_swimfarm.py
"""
from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
SYNC = ROOT / "database" / "roster_review" / "sync_roster_madre_to_portal.py"
DATE = "2026-06-28"
WEEK_END = "2026-06-28"


def clean(v) -> str:
    return str(v or "").strip()


def slot_key(sl: dict) -> tuple:
    return (
        clean(sl.get("time_slot")),
        clean(sl.get("client_name")).lower(),
        clean(sl.get("area")).lower(),
    )


def find_week(seed: dict) -> dict | None:
    for w in seed.get("weeks", []):
        if clean(w.get("end")) == WEEK_END:
            return w
    return None


def find_staff(week: dict, staff_key: str) -> dict | None:
    for st in week.get("staff", []):
        if clean(st.get("staffKey")).lower() == staff_key.lower():
            return st
    return None


def pop_day(staff: dict, session_date: str) -> dict | None:
    days = staff.get("days") or []
    for i, d in enumerate(days):
        if clean(d.get("sessionDate")) == session_date:
            return days.pop(i)
    return None


def get_day(staff: dict, session_date: str) -> dict | None:
    for d in staff.get("days") or []:
        if clean(d.get("sessionDate")) == session_date:
            return d
    return None


def ensure_day(staff: dict, session_date: str, weekday: str = "Sunday") -> dict:
    day = get_day(staff, session_date)
    if day:
        return day
    day = {"sessionDate": session_date, "weekday": weekday, "slots": []}
    staff.setdefault("days", []).append(day)
    return day


def remove_slot(day: dict, time_slot: str, client_name: str) -> dict | None:
    slots = day.get("slots") or []
    target = clean(client_name).lower()
    ts = clean(time_slot)
    for i, sl in enumerate(slots):
        if clean(sl.get("time_slot")) == ts and clean(sl.get("client_name")).lower() == target:
            return slots.pop(i)
    return None


def find_slot_anywhere(seed: dict, session_date: str, time_slot: str, client_name: str) -> dict | None:
    week = find_week(seed)
    if not week:
        return None
    target = clean(client_name).lower()
    ts = clean(time_slot)
    for st in week.get("staff", []):
        day = get_day(st, session_date)
        if not day:
            continue
        for sl in day.get("slots") or []:
            if clean(sl.get("time_slot")) == ts and clean(sl.get("client_name")).lower() == target:
                return sl
    return None


def reassign_instructors(slots: list[dict], old: str, new: str) -> int:
    n = 0
    for sl in slots:
        ins = clean(sl.get("instructors")).upper()
        if ins == old.upper():
            sl["instructors"] = new.upper()
            n += 1
    return n


def main() -> None:
    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    week = find_week(seed)
    if not week:
        raise SystemExit(f"Week ending {WEEK_END} not found in MADRE")

    log: list[str] = []

    dan = find_staff(week, "dan")
    javier = find_staff(week, "javier")
    bismark = find_staff(week, "bismark")
    giuseppe = find_staff(week, "giuseppe")
    roberto = find_staff(week, "roberto")
    if not all([dan, javier, bismark, giuseppe, roberto]):
        raise SystemExit("Missing expected staff blocks in week 2026-06-22..28")

    # --- 9:30–10:15 hub / pool layout ---
    jack_s_src = remove_slot(get_day(javier, DATE), "9.30 to 10.15", "Jack S")
    if jack_s_src:
        jack_s_src = copy.deepcopy(jack_s_src)
        jack_s_src["area"] = "Hub Room"
        jack_s_src["pool_note"] = "Hub Room"
        jack_s_src["instructors"] = "GIUSEPPE"
        jack_s_src["service"] = "Multi-Activity"
        giuseppe_day = ensure_day(giuseppe, DATE)
        if not any(slot_key(s) == slot_key(jack_s_src) for s in giuseppe_day["slots"]):
            giuseppe_day["slots"].append(jack_s_src)
        log.append("Jack S 9:30 → Giuseppe Hub Room")

    removed_samer = remove_slot(get_day(bismark, DATE), "9.30 to 10.15", "Samer")
    if removed_samer:
        log.append("Removed Bismark Samer 9:30 Hub (not taught)")

    samer_pool = {
        "time_slot": "9.30 to 10.15",
        "client_name": "Samer",
        "service": "Multi-Activity",
        "area": "Big Pool",
        "pool_note": "Big Pool",
        "venue": "SwimFarm",
        "instructors": "LULIYA",
        "participant_info": clean(removed_samer.get("participant_info") if removed_samer else ""),
    }

    # --- DAN → YOUSSEF (full column) ---
    dan_day = pop_day(dan, DATE)
    if not dan_day:
        raise SystemExit("Expected dan day on 2026-06-28")
    dan_slots = copy.deepcopy(dan_day.get("slots") or [])
    reassign_instructors(dan_slots, "DAN", "YOUSSEF")
    for sl in dan_slots:
        if slot_key(sl) == ("9.30 to 10.15", "adam ab", "small pool"):
            sl["area"] = "Big Pool"
            sl["pool_note"] = "Big Pool"
            log.append("Adam Ab 9:30 → Big Pool under Youssef")

    youssef = find_staff(week, "youssef")
    if not youssef:
        youssef = {
            "staffKey": "youssef",
            "staffName": "Youssef",
            "venues": ["SwimFarm"],
            "days": [],
        }
        week["staff"].append(youssef)
        log.append("Created youssef staff block in week 4")
    youssef_day = ensure_day(youssef, DATE)
    youssef_day["slots"] = dan_slots
    log.append(f"Moved {len(dan_slots)} slots from dan → youssef (YOUSSEF)")

    # --- JAVIER pool → LULIYA ---
    javier_day = pop_day(javier, DATE)
    if not javier_day:
        raise SystemExit("Expected javier day on 2026-06-28")
    javier_slots = copy.deepcopy(javier_day.get("slots") or [])
    reassign_instructors(javier_slots, "JAVIER", "LULIYA")

    lulia = find_staff(week, "lulia")
    if not lulia:
        lulia = {
            "staffKey": "lulia",
            "staffName": "Luliya",
            "venues": ["SwimFarm"],
            "days": [],
        }
        week["staff"].append(lulia)
        log.append("Created lulia staff block in week 4")
    lulia_day = ensure_day(lulia, DATE)
    lulia_day["slots"] = javier_slots
    if not any(slot_key(s) == slot_key(samer_pool) for s in lulia_day["slots"]):
        lulia_day["slots"].append(samer_pool)
        log.append("Added Luliya Samer 9:30 Big Pool")
    log.append(f"Moved {len(javier_slots)} slots from javier → lulia (LULIYA)")

    # --- Roberto: single Yusuf Ah 9 to 10.15 (drop any stray 9:30 duplicate) ---
    roberto_day = get_day(roberto, DATE)
    if roberto_day:
        kept = []
        for sl in roberto_day.get("slots") or []:
            cn = clean(sl.get("client_name")).lower()
            ts = clean(sl.get("time_slot"))
            if cn == "yusuf ah" and ts == "9.30 to 10.15":
                log.append("Dropped duplicate Roberto Yusuf Ah 9:30 slot")
                continue
            if cn == "yusuf ah" and ts != "9 to 10.15":
                sl["time_slot"] = "9 to 10.15"
                log.append("Normalized Roberto Yusuf Ah to 9 to 10.15")
            kept.append(sl)
        roberto_day["slots"] = kept

    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Patched MADRE for {DATE}:")
    for line in log:
        print(" ", line)
    print("Running sync…")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
