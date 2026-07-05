# -*- coding: utf-8 -*-
"""Extiende la ventana del term dashboard a 31 jul 2026 en term_from_timetable.js
(ambas copias) para que el Day Centre extendido se vea en Session Overview.

  - termDashboardCalendarTo / lastDate -> 2026-07-31
  - termStaffOffWeekdaysRangeByProfileKey.roberto.to -> 2026-07-31
  - termStaffShiftDatesByProfileKey: añade fechas 20-31 jul para los 6 staff.

  python database/roster_review/patch_term_config_extend_july31.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = [
    ROOT / "working_ui" / "portal" / "term_from_timetable.js",
    ROOT / "working_ui" / "portal-shared-js" / "term_from_timetable.js",
]

NEW_TO = "2026-07-31"

# fechas de turno diurno (Day Centre) por staff en la extensión 20-31 jul
EXT = {
    "roberto": ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24",
                "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"],
    "victor":  ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24",
                "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"],
    "raul":    ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24",
                "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"],
    "luliya":  ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-24",
                "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-31"],
    "lulia":   ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-24",
                "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-31"],
    "michelle": ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-24",
                 "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-31"],
    "youssef": ["2026-07-20", "2026-07-22", "2026-07-24",
                "2026-07-27", "2026-07-29", "2026-07-31"],
}


def merge(dst, extra):
    have = set(dst or [])
    out = list(dst or [])
    for d in extra:
        if d not in have:
            have.add(d)
            out.append(d)
    return sorted(out)


for path in FILES:
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"window\.PORTAL_TERM_FROM_TIMETABLE\s*=\s*(\{[\s\S]*\})\s*;", txt)
    if not m:
        raise SystemExit(f"config object not found in {path}")
    cfg = json.loads(m.group(1))

    cfg["termDashboardCalendarTo"] = NEW_TO
    cfg["lastDate"] = NEW_TO

    off = cfg.get("termStaffOffWeekdaysRangeByProfileKey") or {}
    if "roberto" in off and isinstance(off["roberto"], dict):
        off["roberto"]["to"] = NEW_TO

    sd = cfg.setdefault("termStaffShiftDatesByProfileKey", {})
    for k, dates in EXT.items():
        if k in sd and isinstance(sd[k], list):
            sd[k] = merge(sd[k], dates)

    header = "// Auto-generated in part by build_portal_summer2_roster_feedback.js (feedback catch-up)\n"
    body = header + "window.PORTAL_TERM_FROM_TIMETABLE = " + json.dumps(cfg, indent=2, ensure_ascii=False) + ";\n"
    path.write_text(body, encoding="utf-8")
    print(f"Updated {path.relative_to(ROOT)}: to={NEW_TO}, shiftDates ext for {len(EXT)} keys")
