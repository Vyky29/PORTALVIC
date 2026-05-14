# -*- coding: utf-8 -*-
"""Emit roster lines per staff from staff_clients_machine.json (same instructor matching as adapter).

Profiles (display names) still come from staff_dashboard_spreadsheet_bundle.js staffProfiles.
Re-run: python database/_export_staff_client_checklist.py
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUNDLE = ROOT / "staff_dashboard_spreadsheet_bundle.js"
ROWS_JSON = ROOT / "staff_clients_machine.json"
OUT = ROOT / "_staff_client_checklist.txt"


def normalize_person_id(value: str) -> str:
    v = unicodedata.normalize("NFD", str(value or ""))
    v = "".join(c for c in v if unicodedata.category(c) != "Mn")
    v = re.sub(r"[^a-z0-9]+", "", v.lower()).strip()
    if not v:
        return ""
    if v in ("yousef", "youssef"):
        return "yusef"
    return v


def load_profiles_from_bundle(text: str) -> dict[str, str]:
    profiles: dict[str, str] = {}
    pat = re.compile(
        r'"([a-z0-9]+)"\s*:\s*\{\s*"staffId"\s*:\s*"[^"]+",\s*"staffName"\s*:\s*"([^"]+)"',
        re.I,
    )
    for m in pat.finditer(text):
        profiles[m.group(1).lower()] = m.group(2)
    return profiles


def instructor_profile_keys_for_row(instructors_raw: str, profiles: dict[str, str]) -> list[str]:
    keys = list(profiles.keys())
    parts = re.split(r",|/|&|\band\b", str(instructors_raw or ""), flags=re.I)
    parts = [p.strip() for p in parts if str(p).strip()]
    out: list[str] = []
    seen: set[str] = set()
    for p in parts:
        n = normalize_person_id(p)
        if not n:
            continue
        hit = next((k for k in keys if normalize_person_id(k) == n), None)
        if not hit and n == "yusef":
            hit = next((k for k in keys if str(k).lower() == "youssef"), None)
        if hit and hit not in seen:
            seen.add(hit)
            out.append(hit)
    return out


def main() -> None:
    text = BUNDLE.read_text(encoding="utf-8")
    profiles = load_profiles_from_bundle(text)
    rows = json.loads(ROWS_JSON.read_text(encoding="utf-8"))

    day_order = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ]
    by_staff: dict[str, list[dict]] = {}
    for row in rows:
        for k in instructor_profile_keys_for_row(row.get("instructors", ""), profiles):
            by_staff.setdefault(k, []).append(
                {
                    "day": str(row.get("day") or ""),
                    "time": re.sub(
                        r"\s+",
                        " ",
                        str(row.get("time_slot") or "")
                        .replace(" - ", "-")
                        .replace(" to ", "-")
                        .strip(),
                    ),
                    "client": str(row.get("client_name") or "").strip(),
                    "activity": str(row.get("service") or "").strip(),
                    "area": str(row.get("area") or "").strip(),
                    "venue": str(row.get("venue") or "").strip(),
                }
            )

    def sort_key(r: dict) -> tuple:
        d = day_order.index(r["day"]) if r["day"] in day_order else 99
        return d, r["time"]

    lines: list[str] = []
    for sid in sorted(profiles.keys(), key=lambda x: profiles[x].lower()):
        name = profiles[sid]
        lst = sorted(by_staff.get(sid, []), key=sort_key)
        lines.append("")
        lines.append(f"=== {name} ({sid}) — {len(lst)} rows ===")
        for r in lst:
            lines.append(
                f"{r['day']}, {r['time']}, {r['client']}, {r['activity']}, {r['area']}, {r['venue']}"
            )

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
