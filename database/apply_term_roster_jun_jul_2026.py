# -*- coding: utf-8 -*-
"""
Replace undated (weekday template) roster rows for Summer term post half-term
(2026-06-01 .. 2026-07-17). Keeps dated session_date rows (May week imports).

Run: python database/apply_term_roster_jun_jul_2026.py
Then: python database/build_machine_exports.py  (patch bundle only if xlsx missing)
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "database"
JSON_PATH = OUT / "staff_clients_machine.json"

# Tue 5.30–6: Angel takes Rayan Ta; Hazem goes to Roberto (Jun–Jul 2026 term).
TUESDAY_HAZEM_RAYAN_SWAP_START = "2026-06-02"
TUESDAY_HAZEM_ROBERTO_END = "2026-07-14"
TUESDAY_RAYAN_ANGEL_END = "2026-07-17"
TUESDAY_SWAP_SLOT = "5.30 to 6"

# Carlos off weekday roster from 2026-06-01 through July; keeps Sunday climbing only.
CARLOS_WEEKDAY_OFF_START = "2026-06-01"
CARLOS_WEEKDAY_OFF_END = "2026-07-31"

# Michelle off Ikram day-centre cover on these Wednesdays (Luliya only).
MICHELLE_IKRAM_WEDNESDAY_OFF = frozenset({"2026-06-10", "2026-06-17"})
MONDAY_2026_06_29_DAY_CENTRE_ROWS = (
    ("ACAT", "ROBERTO", "Aquatic Activity", "Big Pool", "11 to 12"),
    ("Ikram", "YOUSSEF, CARLOS", "Day Centre", "Hub Room", "11 to 12"),
    ("Emanuel", "MICHELLE", "Day Centre", "Hub Room", "11 to 12"),
    ("Timi", "VICTOR", "Day Centre", "Hub Room", "11 to 1"),
    ("Ikram", "MICHELLE, CARLOS", "Day Centre", "Hub Room", "12 to 4"),
    ("Emanuel", "YOUSSEF", "Aquatic Activity", "Big Pool", "12 to 1"),
    ("Timi", "ROBERTO", "Aquatic Activity", "Big Pool", "12 to 12.30"),
    ("Fadi", "ROBERTO", "Day Centre", "Hub Room", "12.30 to 3"),
    ("Fadi", "YOUSSEF", "Day Centre", "Hub Room", "1 to 3"),
    ("Emanuel", "VICTOR", "Day Centre", "Hub Room", "1 to 4"),
    ("HOME", "RAUL", "Day Centre", "HOME", "11 to 1"),
    ("MANAGER", "RAUL", "Manager", "Manager", "1 to 4"),
)

EMANUEL_ROSTER_START = "2026-06-12"
TIMI_ROSTER_START = "2026-06-15"
# Timi Day Centre Mon/Fri 11–13 with Victor (was RAUL 13–15; Victor was on HOME mornings).
TIMI_VICTOR_MF_SLOT = "11 to 1"
TIMI_WED_RAUL_SLOT = "1 to 3"
SUMMER_TERM_END = "2026-07-17"
_WEEKDAY_NAMES = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)


def _strip_carlos_from_instructors(instr: str) -> str | None:
    parts = [p.strip() for p in instr.split(",") if p.strip()]
    if not any(p.upper() == "CARLOS" for p in parts):
        return None
    kept = [p for p in parts if p.upper() != "CARLOS"]
    if not kept:
        return None
    return ", ".join(kept)


def patch_carlos_weekday_roster_off(rows: list[dict]) -> int:
    """Remove Carlos from non-Sunday rows from Jun–Jul 2026 (dated + undated template)."""
    n = 0
    for row in rows:
        if str(row.get("day") or "").strip() == "Sunday":
            continue
        sd = str(row.get("session_date") or "").strip()[:10]
        if sd and (sd < CARLOS_WEEKDAY_OFF_START or sd > CARLOS_WEEKDAY_OFF_END):
            continue
        instr = str(row.get("instructors") or "").strip()
        new_instr = _strip_carlos_from_instructors(instr)
        if new_instr and new_instr != instr:
            row["instructors"] = new_instr
            n += 1
    return n


def patch_michelle_ikram_wednesday_off(rows: list[dict]) -> int:
    """Remove Michelle from Ikram day-centre rows on her off Wednesdays."""
    n = 0
    for row in rows:
        sd = str(row.get("session_date") or "").strip()[:10]
        if sd not in MICHELLE_IKRAM_WEDNESDAY_OFF:
            continue
        if str(row.get("client_name") or "").strip().lower() != "ikram":
            continue
        instr = str(row.get("instructors") or "").strip()
        parts = [p.strip() for p in instr.split(",") if p.strip()]
        kept = [p for p in parts if p.upper() != "MICHELLE"]
        if len(kept) == len(parts):
            continue
        row["instructors"] = ", ".join(kept) if kept else "LULIA"
        n += 1
    return n


def patch_day_centre_2026_06_29(rows: list[dict]) -> dict[str, int]:
    """Special Monday 29 Jun day-centre rota after pool access moved 30 min earlier."""
    kept: list[dict] = []
    removed = 0
    managed_clients = {"acat", "ikram", "emanuel", "timi", "fadi", "home", "manager"}
    for row in rows:
        sd = str(row.get("session_date") or "").strip()[:10]
        if sd == "2026-06-29" and _client_slug(row.get("client_name")) in managed_clients:
            removed += 1
            continue
        kept.append(row)
    for client, instructors, service, area, time_slot in MONDAY_2026_06_29_DAY_CENTRE_ROWS:
        row = r(client, "Monday", instructors, time_slot, service=service, area=area, venue="SwimFarm")
        row["session_date"] = "2026-06-29"
        kept.append(row)
    rows.clear()
    rows.extend(kept)
    return {"removed": removed, "added": len(MONDAY_2026_06_29_DAY_CENTRE_ROWS)}


def patch_legacy_sunday_morning_pool(rows: list[dict]) -> int:
    """Remove only erroneous Zaid 9:00 slot (he starts 9:30, not 9:00)."""
    removed = 0
    kept: list[dict] = []
    for row in rows:
        client = str(row.get("client_name") or "").strip()
        day = str(row.get("day") or "").strip()
        slot = str(row.get("time_slot") or "").strip()
        if client == "Zaid" and day == "Sunday" and slot == "9 to 9.30":
            removed += 1
            continue
        kept.append(row)
    rows.clear()
    rows.extend(kept)
    return removed


def patch_sunday_small_pool_shire_simon(rows: list[dict]) -> int:
    """Shire & Simon 9:00–9:30 Sunday = Small Pool (SwimFarm aquatic lane)."""
    n = 0
    for row in rows:
        client = str(row.get("client_name") or "").strip()
        if client not in ("Shire", "Simon"):
            continue
        if str(row.get("day") or "").strip() != "Sunday":
            continue
        if str(row.get("time_slot") or "").strip() != "9 to 9.30":
            continue
        if str(row.get("area") or "").strip() == "Small Pool":
            continue
        row["area"] = "Small Pool"
        row["service"] = "Aquatic Activity"
        n += 1
    return n


def patch_tuesday_hazem_rayan_instructors(rows: list[dict]) -> int:
    """Apply dated + template instructor swap for Hazem / Rayan Ta (Tue Teaching Pool 5.30–6)."""
    n = 0
    for row in rows:
        if row.get("day") != "Tuesday" or row.get("time_slot") != TUESDAY_SWAP_SLOT:
            continue
        client = str(row.get("client_name") or "").strip()
        if client not in ("Hazem", "Rayan Ta"):
            continue
        sd = str(row.get("session_date") or "").strip()[:10]
        if sd:
            if sd < TUESDAY_HAZEM_RAYAN_SWAP_START or sd > TUESDAY_RAYAN_ANGEL_END:
                continue
            if client == "Rayan Ta":
                want = "ANGEL"
            elif sd > TUESDAY_HAZEM_ROBERTO_END:
                continue
            else:
                want = "ROBERTO"
        else:
            want = "ANGEL" if client == "Rayan Ta" else "ROBERTO"
        if str(row.get("instructors") or "").strip().upper() != want:
            row["instructors"] = want
            n += 1
    return n


def r(
    client: str,
    day: str,
    instructors: str,
    time_slot: str,
    *,
    service: str = "Aquatic Activity",
    area: str = "Teaching Pool",
    venue: str = "Acton",
) -> dict:
    return {
        "client_name": client,
        "day": day,
        "instructors": instructors,
        "service": service,
        "area": area,
        "time_slot": time_slot,
        "venue": venue,
    }


def morning_day_centre() -> list[dict]:
    """Day Centre / hub morning — user spec May 2026."""
    dc = "Day Centre"
    hub = "Hub Room"
    sf = "SwimFarm"
    rows: list[dict] = []

    for day in ("Monday", "Tuesday", "Wednesday", "Friday"):
        rows.append(
            r("Ikram", day, "LULIA, MICHELLE", "11 to 4", service=dc, area=hub, venue=sf)
        )

    # Emanuel is NOT a weekday template: he starts 2026-06-12 and is stored as dated
    # session_date rows (Mon/Wed: YOUSSEF 11 to 3 + VICTOR 3 to 4; Fri: YOUSSEF 11 to 4)
    # directly in staff_clients_machine.json. Do not regenerate him here.
    for day in ("Monday", "Wednesday", "Friday"):
        rows.append(
            r(
                "Fadi",
                day,
                "ROBERTO, YOUSSEF",
                "12.30 to 3",
                service=dc,
                area=hub,
                venue=sf,
            )
        )

    rows.append(
        r("ACAT", "Monday", "ROBERTO", "11 to 12", service=dc, area=hub, venue=sf)
    )

    # Fadi always 12.30–15:00; Roberto every day + Youssef (Mon/Wed/Fri), Victor (Tue), Raul (Thu).
    for day in ("Tuesday", "Thursday"):
        rows.append(
            r("Fadi", day, "ROBERTO", "12.30 to 3", service=dc, area=hub, venue=sf)
        )

    rows.append(
        r("Fadi", "Tuesday", "VICTOR", "12.30 to 3", service=dc, area=hub, venue=sf)
    )
    rows.append(
        r("Fadi", "Thursday", "RAUL", "12.30 to 3", service=dc, area=hub, venue=sf)
    )

    # Timi is NOT a weekday template: Mon/Fri 11–13 Victor, Wed 13–15 Raul — dated rows only
    # (see patch_emanuel_timi_roster).

    return rows


def monday_afternoon() -> list[dict]:
    aa = "Aquatic Activity"
    tp = "Teaching Pool"
    return [
        r("CLOSED", "Monday", "YOUSSEF", "4 to 4.30", service=aa, area=tp, venue="Acton"),
        r("Eddie", "Monday", "YOUSSEF", "4.30 to 5", service=aa, area=tp, venue="Acton"),
        r("Joel", "Monday", "YOUSSEF", "5 to 5.30", service=aa, area=tp, venue="Acton"),
        r("Abodi P", "Monday", "YOUSSEF", "5.30 to 6.30", service=aa, area=tp, venue="Acton"),
        r("Adam Pi", "Monday", "ANGEL", "4 to 5.30", service=aa, area=tp, venue="Acton"),
        r("Steven C", "Monday", "ANGEL", "5.30 to 6", service=aa, area=tp, venue="Acton"),
        r("Mario", "Monday", "ANGEL", "6 to 6.30", service=aa, area=tp, venue="Acton"),
        r(
            "Tinashe",
            "Monday",
            "BISMARK, GIUSEPPE, JOHN",
            "4.30 to 6",
            service="Bespoke Programme",
            area="Hub Room",
            venue="SwimFarm",
        ),
        r(
            "Ayaan",
            "Monday",
            "SANDRA",
            "4 to 5",
            service="Physical Activity",
            area="Gym",
            venue="Westway",
        ),
        r(
            "Serine",
            "Monday",
            "SANDRA",
            "5 to 6",
            service="Physical Activity",
            area="Gym",
            venue="Westway",
        ),
        r("Yunis", "Monday", "ROBERTO", "4.30 to 5", service=aa, area=tp, venue="Northolt"),
        r("Amar Ra", "Monday", "ROBERTO", "5 to 6", service=aa, area=tp, venue="Northolt"),
        r("Yamik", "Monday", "ROBERTO", "6 to 6.30", service=aa, area=tp, venue="Northolt"),
        r("Gemma", "Monday", "DAN", "5 to 5.30", service=aa, area=tp, venue="Northolt"),
        r("Zayana", "Monday", "DAN", "5.30 to 6", service=aa, area=tp, venue="Northolt"),
        r("Adaam Ah", "Monday", "DAN", "6 to 6.30", service=aa, area=tp, venue="Northolt"),
    ]


def tuesday_afternoon() -> list[dict]:
    aa = "Aquatic Activity"
    tp = "Teaching Pool"
    return [
        r("Jad", "Tuesday", "ROBERTO", "4 to 4.30", service=aa, area=tp, venue="Acton"),
        r("Serine", "Tuesday", "ROBERTO", "4.30 to 5.30", service=aa, area=tp, venue="Acton"),
        r("Rayan Ta", "Tuesday", "ANGEL", "5.30 to 6", service=aa, area=tp, venue="Acton"),
        r("Eiji", "Tuesday", "ROBERTO", "6 to 6.30", service=aa, area=tp, venue="Acton"),
        r("Ayman", "Tuesday", "JAVIER", "4 to 4.30", service=aa, area=tp, venue="Acton"),
        r("Adam Me", "Tuesday", "JAVIER", "4.30 to 5", service=aa, area=tp, venue="Acton"),
        r("Linda", "Tuesday", "JAVIER", "5 to 5.30", service=aa, area=tp, venue="Acton"),
        r("Eiji", "Tuesday", "JAVIER", "5.30 to 6", service=aa, area=tp, venue="Acton"),
        r("Kareena", "Tuesday", "JAVIER", "6 to 6.30", service=aa, area=tp, venue="Acton"),
        r("CLOSED", "Tuesday", "ANGEL", "4 to 4.30", service=aa, area=tp, venue="Acton"),
        r("NO CLIENT", "Tuesday", "ANGEL", "4.30 to 5", service=aa, area=tp, venue="Acton"),
        r("Amir", "Tuesday", "ANGEL", "5 to 5.30", service=aa, area=tp, venue="Acton"),
        r("Hazem", "Tuesday", "ROBERTO", "5.30 to 6", service=aa, area=tp, venue="Acton"),
        r("Richard", "Tuesday", "ANGEL", "6 to 6.30", service=aa, area=tp, venue="Acton"),
        r("CLOSED", "Tuesday", "AURORA", "4 to 4.30", service=aa, area=tp, venue="Acton"),
        r("Bediako", "Tuesday", "AURORA", "4.30 to 5", service=aa, area=tp, venue="Acton"),
        r("Junaid", "Tuesday", "AURORA", "5 to 5.30", service=aa, area=tp, venue="Acton"),
        r("Aydaan Ah", "Tuesday", "AURORA", "5.30 to 6", service=aa, area=tp, venue="Acton"),
        r("Eiji", "Tuesday", "AURORA", "6 to 6.30", service=aa, area=tp, venue="Acton"),
        r("CLOSED", "Tuesday", "YOUSSEF", "4 to 4.30", service=aa, area=tp, venue="Acton"),
        r("NO CLIENT", "Tuesday", "YOUSSEF", "4.30 to 5", service=aa, area=tp, venue="Acton"),
        r("Logan", "Tuesday", "YOUSSEF", "5 to 5.30", service=aa, area=tp, venue="Acton"),
        r("Rayyan Fi", "Tuesday", "YOUSSEF", "5.30 to 6.30", service=aa, area=tp, venue="Acton"),
    ]


def wednesday_afternoon() -> list[dict]:
    aa = "Aquatic Activity"
    tp = "Teaching Pool"
    ma = "Multi-Activity"
    r2 = "Room 2"
    return [
        r("Cyrus", "Wednesday", "JAVIER", "4 to 4.30", service=ma, area="Teaching Pool", venue="Acton"),
        r("Cyrus", "Wednesday", "JAVIER", "4.30 to 5.15", service=ma, area=r2, venue="Acton"),
        r("Adam Ab", "Wednesday", "JAVIER", "5.15 to 6", service=ma, area=r2, venue="Acton"),
        r("Kayden", "Wednesday", "JAVIER", "6 to 6.30", service=aa, area=tp, venue="Acton"),
        r("NO CLIENT", "Wednesday", "YOUSSEF", "4 to 4.30", service=ma, area=r2, venue="Acton"),
        r("Stephanie", "Wednesday", "YOUSSEF", "4.30 to 5.15", service=ma, area=r2, venue="Acton"),
        r("Scott", "Wednesday", "YOUSSEF", "5.15 to 6", service=ma, area=r2, venue="Acton"),
        r("NO CLIENT", "Wednesday", "YOUSSEF", "6 to 6.30", service=aa, area=tp, venue="Acton"),
        r("Cyrus", "Wednesday", "BERTA", "4.30 to 5.15", service=ma, area=r2, venue="Acton"),
        r("Adam Ab", "Wednesday", "BERTA", "5.15 to 6", service=ma, area=r2, venue="Acton"),
        r("Stephanie", "Wednesday", "GIUSEPPE", "4.30 to 5.15", service=ma, area=r2, venue="Acton"),
        r("Scott", "Wednesday", "GIUSEPPE", "5.15 to 6", service=ma, area=r2, venue="Acton"),
        r("Tyson", "Wednesday", "DAN", "4.30 to 5", service=aa, area=tp, venue="Northolt"),
        r("Ruben", "Wednesday", "DAN", "5 to 5.30", service=aa, area=tp, venue="Northolt"),
        r("Mia", "Wednesday", "DAN", "5.30 to 6.30", service=aa, area=tp, venue="Northolt"),
        r("Vithura", "Wednesday", "ROBERTO", "4.30 to 5", service=aa, area=tp, venue="Northolt"),
        r("Amar Ra", "Wednesday", "ROBERTO", "5 to 6", service=aa, area=tp, venue="Northolt"),
        r("Amber", "Wednesday", "ROBERTO", "6 to 6.30", service=aa, area=tp, venue="Northolt"),
        r(
            "Tinashe",
            "Wednesday",
            "BISMARK, GIUSEPPE, JOHN",
            "4.30 to 6",
            service="Bespoke Programme",
            area="Hub Room",
            venue="SwimFarm",
        ),
    ]


def thursday_afternoon() -> list[dict]:
    aa = "Aquatic Activity"
    tp = "Teaching Pool"
    hub = "Hub Room"
    sf = "SwimFarm"
    return [
        r(
            "Cyrus",
            "Thursday",
            "VICTOR",
            "3.30 to 5",
            service="Bespoke Programme",
            area=hub,
            venue=sf,
        ),
        r("Ayman", "Thursday", "JAVIER", "4 to 4.30", service=aa, area=tp, venue="Acton"),
        r("Ayman", "Thursday", "JAVIER", "4.30 to 5", service=aa, area=tp, venue="Acton"),
        r("Khalid Ab", "Thursday", "JAVIER", "5 to 5.30", service=aa, area=tp, venue="Acton"),
        r("Karo", "Thursday", "JAVIER", "5.30 to 6", service=aa, area=tp, venue="Acton"),
        r("Hazem", "Thursday", "JAVIER", "6 to 6.30", service=aa, area=tp, venue="Acton"),
        r("Tom", "Thursday", "ROBERTO", "4 to 4.30", service=aa, area=tp, venue="Acton"),
        r("Yassir", "Thursday", "ROBERTO", "4.30 to 5", service=aa, area=tp, venue="Acton"),
        r("Yossi", "Thursday", "ROBERTO", "5 to 5.30", service=aa, area=tp, venue="Acton"),
        r("Mohammed", "Thursday", "ROBERTO", "5.30 to 6.30", service=aa, area=tp, venue="Acton"),
        r("Elijah", "Thursday", "AURORA", "4 to 4.30", service=aa, area=tp, venue="Acton"),
        r("Aqsa", "Thursday", "AURORA", "4.30 to 5.30", service=aa, area=tp, venue="Acton"),
        r("Hazem", "Thursday", "AURORA", "5.30 to 6", service=aa, area=tp, venue="Acton"),
        r("Maiyar", "Thursday", "AURORA", "6 to 6.30", service=aa, area=tp, venue="Acton"),
        r("NO CLIENT", "Thursday", "SIMON", "4 to 4.30", service=aa, area=tp, venue="Acton"),
        r("Thushyan", "Thursday", "SIMON", "4.30 to 5", service=aa, area=tp, venue="Acton"),
        r("Yuri", "Thursday", "SIMON", "5 to 5.30", service=aa, area=tp, venue="Acton"),
        r("Eiji", "Thursday", "SIMON", "5.30 to 6.30", service=aa, area=tp, venue="Acton"),
    ]


def friday_afternoon() -> list[dict]:
    aa = "Aquatic Activity"
    tp = "Teaching Pool"
    return [
        r(
            "Tinashe",
            "Friday",
            "BISMARK, GIUSEPPE, JOHN",
            "4.30 to 6",
            service="Bespoke Programme",
            area="Hub Room",
            venue="SwimFarm",
        ),
        r("Adam Pi", "Friday", "ROBERTO", "4 to 5.30", service=aa, area=tp, venue="Acton"),
        r("Amaar Ah", "Friday", "ROBERTO", "5.30 to 6", service=aa, area=tp, venue="Acton"),
    ]


def saturday_roster() -> list[dict]:
    aa = "Aquatic Activity"
    tp = "Teaching Pool"
    return [
        r("NO CLIENT", "Saturday", "YOUSSEF", "9.30 to 10", service=aa, area=tp, venue="Acton"),
        r("NO CLIENT", "Saturday", "YOUSSEF", "10 to 10.30", service=aa, area=tp, venue="Acton"),
        r("Emani", "Saturday", "YOUSSEF", "10.30 to 11", service=aa, area=tp, venue="Acton"),
        r("Matthias", "Saturday", "YOUSSEF", "11 to 12", service=aa, area=tp, venue="Acton"),
        r("Saaib", "Saturday", "YOUSSEF", "12 to 12.30", service=aa, area=tp, venue="Acton"),
        r("NO CLIENT", "Saturday", "YOUSSEF", "12.30 to 1", service=aa, area=tp, venue="Acton"),
    ]


def sunday_roster() -> list[dict]:
    aa = "Aquatic Activity"
    ma = "Multi-Activity"
    sf = "SwimFarm"
    tp = "Teaching Pool"
    r2 = "Room 2"
    climb = "Climbing Activity"
    ww = "Westway"
    rows = [
        r("Simon", "Sunday", "AURORA", "9 to 9.30", service=aa, area="Small Pool", venue=sf),
        r("Adam Ab", "Sunday", "AURORA", "9.30 to 10.15", service=aa, area=tp, venue=sf),
        r("Jack W", "Sunday", "AURORA", "10.15 to 11", service=aa, area=tp, venue=sf),
        r("Arthur Ma", "Sunday", "AURORA", "11 to 11.45", service=aa, area=tp, venue=sf),
        r("Cyrus", "Sunday", "AURORA", "11.45 to 12.30", service=aa, area=tp, venue=sf),
        r("Aydaan Ah", "Sunday", "AURORA", "12.30 to 1.15", service=aa, area=tp, venue=sf),
        r("Erik", "Sunday", "AURORA", "1.15 to 2", service=aa, area=tp, venue=sf),
        r("Zakariya", "Sunday", "AURORA", "2 to 2.30", service=aa, area=tp, venue=sf),
        r("Faris", "Sunday", "AURORA", "2.30 to 3", service=aa, area=tp, venue=sf),
        r("Shire", "Sunday", "JAVIER", "9 to 9.30", service=aa, area="Small Pool", venue=sf),
        r("Samer", "Sunday", "JAVIER", "9.30 to 10.15", service=aa, area=tp, venue=sf),
        r("Zaid", "Sunday", "JAVIER", "9.30 to 10.15", service=ma, area="Big Pool", venue=sf),
        r("Zaid", "Sunday", "JAVIER", "10.15 to 11", service=aa, area=tp, venue=sf),
        r("Hazem", "Sunday", "JAVIER", "11 to 11.45", service=ma, area="Big Pool", venue=sf),
        r("Eiji", "Sunday", "JAVIER", "11.45 to 12.30", service=aa, area=tp, venue=sf),
        r("Rayyan Fi", "Sunday", "JAVIER", "12.30 to 1.15", service=aa, area=tp, venue=sf),
        r("Haneef", "Sunday", "JAVIER", "1.15 to 2", service=aa, area=tp, venue=sf),
        r("Max", "Sunday", "JAVIER", "2 to 2.30", service=aa, area=tp, venue=sf),
        r("Shaan", "Sunday", "JAVIER", "2.30 to 3", service=aa, area=tp, venue=sf),
        r("Yusuf Ah", "Sunday", "ROBERTO", "9 to 10.15", service=aa, area=tp, venue=sf),
        r("Jack S", "Sunday", "ROBERTO", "10.15 to 11", service=aa, area=tp, venue=sf),
        r("Gabriel", "Sunday", "ROBERTO", "11 to 11.45", service=aa, area=tp, venue=sf),
        r("Arthur Mo", "Sunday", "ROBERTO", "11.45 to 12.30", service=aa, area=tp, venue=sf),
        r("Amaar Ah", "Sunday", "ROBERTO", "12.30 to 1.15", service=aa, area=tp, venue=sf),
        r("Adaam Ah", "Sunday", "ROBERTO", "1.15 to 2", service=aa, area=tp, venue=sf),
        r("Rodin", "Sunday", "ROBERTO", "2 to 2.30", service=aa, area=tp, venue=sf),
        r("Yoan", "Sunday", "ROBERTO", "2.30 to 3", service=aa, area=tp, venue=sf),
        r("Jack W", "Sunday", "JOHN, BERTA", "9.30 to 10.15", service=ma, area=r2, venue=sf),
        r("Adam Ab", "Sunday", "JOHN, BERTA", "10.15 to 11", service=ma, area=r2, venue=sf),
        r("Cyrus", "Sunday", "JOHN, BERTA", "11 to 11.45", service=ma, area=r2, venue=sf),
        r("Arthur Ma", "Sunday", "JOHN, BERTA", "11.45 to 12.30", service=ma, area=r2, venue=sf),
        r("Erik", "Sunday", "JOHN, BERTA", "12.30 to 1.15", service=ma, area=r2, venue=sf),
        r("Aydaan Ah", "Sunday", "JOHN, BERTA", "1.15 to 2", service=ma, area=r2, venue=sf),
        r("Samer", "Sunday", "GIUSEPPE", "9.30 to 10.15", service=ma, area=r2, venue=sf),
        r("Zaid", "Sunday", "GIUSEPPE", "10.15 to 11", service=ma, area=r2, venue=sf),
        r("Eiji", "Sunday", "GIUSEPPE", "11 to 11.45", service=ma, area=r2, venue=sf),
        r("Hazem", "Sunday", "GIUSEPPE", "11.45 to 12.30", service=ma, area=r2, venue=sf),
        r("Haneef", "Sunday", "GIUSEPPE", "12.30 to 1.15", service=ma, area=r2, venue=sf),
        r("Rayyan Fi", "Sunday", "GIUSEPPE", "1.15 to 2", service=ma, area=r2, venue=sf),
        r("Jack S", "Sunday", "BISMARK", "9.30 to 10.15", service=ma, area=r2, venue=sf),
        r("Yusuf Ah", "Sunday", "BISMARK", "10.15 to 11", service=ma, area=r2, venue=sf),
        r("Arthur Mo", "Sunday", "BISMARK", "11 to 11.45", service=ma, area=r2, venue=sf),
        r("Gabriel", "Sunday", "BISMARK", "11.45 to 12.30", service=ma, area=r2, venue=sf),
        r("Adaam Ah", "Sunday", "BISMARK", "12.30 to 1.15", service=ma, area=r2, venue=sf),
        r("Amaar Ah", "Sunday", "BISMARK", "1.15 to 2", service=ma, area=r2, venue=sf),
        r("Hazem", "Sunday", "CARLOS", "10 to 11", service=climb, area="Wall", venue=ww),
        r("Zaid", "Sunday", "CARLOS", "11 to 12", service=climb, area="Wall", venue=ww),
        r("Serine", "Sunday", "CARLOS", "12 to 1", service=climb, area="Wall", venue=ww),
        r("Zakariya", "Sunday", "CARLOS", "1 to 2", service=climb, area="Wall", venue=ww),
        r("Patrick", "Sunday", "CARLOS", "2 to 3", service=climb, area="Wall", venue=ww),
        r("Eiji", "Sunday", "ALEX", "10 to 11", service=climb, area="Wall", venue=ww),
        r("Yusuf Ah", "Sunday", "ALEX", "11 to 12", service=climb, area="Wall", venue=ww),
        r("Scott", "Sunday", "ALEX", "12 to 1", service=climb, area="Wall", venue=ww),
        r("Rodin", "Sunday", "ALEX", "1 to 2", service=climb, area="Wall", venue=ww),
        r("Ayden W", "Sunday", "ALEX", "2 to 3", service=climb, area="Wall", venue=ww),
    ]
    return rows


def _client_slug(name: str) -> str:
    n = str(name or "").strip().lower()
    if n == "timmy":
        return "timi"
    return n


def _iter_iso_weekdays(start_iso: str, end_iso: str, weekday_indexes: tuple[int, ...]):
    start = date.fromisoformat(start_iso)
    end = date.fromisoformat(end_iso)
    d = start
    while d <= end:
        if d.weekday() in weekday_indexes:
            yield d.isoformat(), _WEEKDAY_NAMES[d.weekday()]
        d += timedelta(days=1)


def _timi_victor_monday_friday_dates() -> set[str]:
    return {
        iso
        for iso, _ in _iter_iso_weekdays(TIMI_ROSTER_START, SUMMER_TERM_END, (0, 4))
    }


# Dated HOME visits (Victor/Raul) — Victor Mon/Fri morning omitted when Timi uses that block.
_HOME_DATED_SPECS: tuple[tuple[str, str, str, str], ...] = (
    ("2026-06-15", "Monday", "VICTOR", "11 to 4"),
    ("2026-06-16", "Tuesday", "RAUL", "11 to 4"),
    ("2026-06-19", "Friday", "VICTOR", "11 to 4"),
    ("2026-06-22", "Monday", "VICTOR", "11 to 1"),
    ("2026-06-23", "Tuesday", "RAUL", "11 to 4"),
    ("2026-06-25", "Thursday", "VICTOR", "11 to 3.30"),
    ("2026-06-26", "Friday", "RAUL", "1.30 to 3"),
    ("2026-06-29", "Monday", "VICTOR", "11 to 1"),
    ("2026-06-30", "Tuesday", "RAUL", "11 to 4"),
    ("2026-07-03", "Friday", "VICTOR", "11 to 4"),
    ("2026-07-06", "Monday", "VICTOR", "11 to 1"),
    ("2026-07-08", "Wednesday", "VICTOR", "11 to 4"),
    ("2026-07-09", "Thursday", "VICTOR", "11 to 4"),
    ("2026-07-10", "Friday", "RAUL", "11 to 4"),
    ("2026-07-13", "Monday", "VICTOR", "11 to 1"),
    ("2026-07-14", "Tuesday", "RAUL", "11 to 4"),
    ("2026-07-17", "Friday", "VICTOR", "11 to 4"),
)


def generate_home_dated_rows() -> list[dict]:
    """HOME day-centre placeholder slots; skip Victor Mon/Fri when Timi 11–13 is active."""
    dc = "Day Centre"
    sf = "SwimFarm"
    skip = _timi_victor_monday_friday_dates()
    out: list[dict] = []
    for iso, day, instr, slot in _HOME_DATED_SPECS:
        if (
            instr.upper() == "VICTOR"
            and day in ("Monday", "Friday")
            and iso in skip
        ):
            continue
        row = r("HOME", day, instr, slot, service=dc, area="HOME", venue=sf)
        row["session_date"] = iso
        out.append(row)
    return out


def generate_emanuel_timi_dated_rows() -> list[dict]:
    """Mon/Wed/Fri day-centre dated rows from each client's real start through term end."""
    dc = "Day Centre"
    hub = "Hub Room"
    sf = "SwimFarm"
    out: list[dict] = []
    mwf = (0, 2, 4)
    for iso, day in _iter_iso_weekdays(EMANUEL_ROSTER_START, SUMMER_TERM_END, mwf):
        row = r("Emanuel", day, "YOUSSEF, VICTOR", "11 to 4", service=dc, area=hub, venue=sf)
        row["session_date"] = iso
        out.append(row)
    for iso, day in _iter_iso_weekdays(TIMI_ROSTER_START, SUMMER_TERM_END, (0, 4)):
        row = r("Timi", day, "VICTOR", TIMI_VICTOR_MF_SLOT, service=dc, area=hub, venue=sf)
        row["session_date"] = iso
        out.append(row)
    for iso, day in _iter_iso_weekdays(TIMI_ROSTER_START, SUMMER_TERM_END, (2,)):
        row = r("Timi", day, "RAUL", TIMI_WED_RAUL_SLOT, service=dc, area=hub, venue=sf)
        row["session_date"] = iso
        out.append(row)
    return out


def patch_emanuel_timi_roster(rows: list[dict]) -> dict[str, int]:
    """Drop templates / early term rows; regenerate Emanuel + Timi from start dates."""
    kept: list[dict] = []
    tpl_removed = 0
    dropped = 0
    for row in rows:
        client = _client_slug(row.get("client_name"))
        sd = str(row.get("session_date") or "").strip()[:10]
        if client == "emanuel":
            if not sd:
                tpl_removed += 1
                continue
            if sd <= SUMMER_TERM_END:
                dropped += 1
                continue
        elif client == "timi":
            if not sd:
                tpl_removed += 1
                continue
            if sd >= "2026-06-01" and sd <= SUMMER_TERM_END:
                dropped += 1
                continue
        kept.append(row)
    generated = generate_emanuel_timi_dated_rows()
    kept.extend(generated)
    rows.clear()
    rows.extend(kept)
    return {
        "templates_removed": tpl_removed,
        "dated_dropped": dropped,
        "dated_generated": len(generated),
    }


def patch_home_roster(rows: list[dict]) -> dict[str, int]:
    """Replace term HOME dated rows (Victor/Raul home visits) with Timi-aware schedule."""
    kept: list[dict] = []
    dropped = 0
    for row in rows:
        client = _client_slug(row.get("client_name"))
        sd = str(row.get("session_date") or "").strip()[:10]
        if client == "home" and sd >= TIMI_ROSTER_START and sd <= SUMMER_TERM_END:
            dropped += 1
            continue
        kept.append(row)
    generated = generate_home_dated_rows()
    kept.extend(generated)
    rows.clear()
    rows.extend(kept)
    return {"dated_dropped": dropped, "dated_generated": len(generated)}


def build_template() -> list[dict]:
    out: list[dict] = []
    for part in (
        morning_day_centre,
        monday_afternoon,
        tuesday_afternoon,
        wednesday_afternoon,
        thursday_afternoon,
        friday_afternoon,
        saturday_roster,
        sunday_roster,
    ):
        out.extend(part())
    return out


def main() -> None:
    from import_roster_export_txt import parse_export, EXPORT

    existing = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    dated = [row for row in existing if row.get("session_date")]
    template = parse_export(EXPORT)
    merged = dated + template
    pool_removed = patch_legacy_sunday_morning_pool(merged)
    pool_small = patch_sunday_small_pool_shire_simon(merged)
    patched = patch_tuesday_hazem_rayan_instructors(merged)
    carlos_off = patch_carlos_weekday_roster_off(merged)
    michelle_off = patch_michelle_ikram_wednesday_off(merged)
    emanuel_timi = patch_emanuel_timi_roster(merged)
    home_patch = patch_home_roster(merged)
    day_centre_29 = patch_day_centre_2026_06_29(merged)
    JSON_PATH.write_text(
        json.dumps(merged, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {len(merged)} rows ({len(dated)} dated + {len(template)} template) -> {JSON_PATH}"
    )
    if pool_removed or pool_small:
        print(
            f"Patched Sunday pool: removed {pool_removed} wrong Zaid 9:00 slot(s), set {pool_small} Shire/Simon row(s) to Small Pool"
        )
    if patched:
        print(f"Patched {patched} Tue Hazem/Rayan Ta 5.30–6 instructor row(s)")
    if carlos_off:
        print(
            f"Removed Carlos from {carlos_off} weekday roster row(s) "
            f"({CARLOS_WEEKDAY_OFF_START} .. {CARLOS_WEEKDAY_OFF_END}); Sunday climbing unchanged"
        )
    if michelle_off:
        print(
            f"Removed Michelle from {michelle_off} Ikram row(s) on "
            f"{', '.join(sorted(MICHELLE_IKRAM_WEDNESDAY_OFF))}"
        )
    if emanuel_timi["templates_removed"] or emanuel_timi["dated_dropped"] or emanuel_timi["dated_generated"]:
        print(
            "Emanuel/Timi roster: removed "
            f"{emanuel_timi['templates_removed']} template row(s), dropped "
            f"{emanuel_timi['dated_dropped']} dated row(s), wrote "
            f"{emanuel_timi['dated_generated']} dated row(s) "
            f"(Emanuel from {EMANUEL_ROSTER_START}, Timi Mon/Fri {TIMI_VICTOR_MF_SLOT} Victor + Wed {TIMI_WED_RAUL_SLOT} Raul from {TIMI_ROSTER_START})"
        )
    if home_patch["dated_dropped"] or home_patch["dated_generated"]:
        print(
            "HOME roster: dropped "
            f"{home_patch['dated_dropped']} dated row(s), wrote "
            f"{home_patch['dated_generated']} dated row(s) "
            f"(Victor Mon/Fri HOME omitted while Timi active through {SUMMER_TERM_END})"
        )
    if day_centre_29["removed"] or day_centre_29["added"]:
        print(
            "29 Jun Day Centre roster: removed "
            f"{day_centre_29['removed']} old row(s), wrote {day_centre_29['added']} row(s)"
        )


if __name__ == "__main__":
    main()
