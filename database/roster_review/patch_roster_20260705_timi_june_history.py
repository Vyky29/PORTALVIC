# -*- coding: utf-8 -*-
"""Reconstruye el histórico real de Timi en junio (antes del cambio del 26).

Aclaración del cliente:
  - Timi venía de 1 a 3, SOLO lunes y viernes, con VICTOR y RAUL juntos.
  - Desde el 1 jun. El lunes 22 jun fue ABSENT (no llegaba a tiempo) -> no se crea.
  - Desde el viernes 26 ya está en 11-1 (hecho aparte).
  - No nadaba antes del 26 -> se quitan los swims de lunes 12-12.30 (Roberto)
    del 1, 8, 15 y 22 jun.

Fechas 1-3 (Timi, Victor+Raul): Lun 1, Vie 5, Lun 8, Vie 12, Lun 15, Vie 19 jun.
En esos días para Victor/Raul: se quitan HOME/Casa (trabajaban) y Fadi redundante
(Roberto ya cubre a Fadi esos días); se añade Timi 1-3. Se conserva lo demás.

  python database/roster_review/patch_roster_20260705_timi_june_history.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
SYNC = ROOT / "database" / "roster_review" / "sync_roster_madre_to_portal.py"

TIMI_13 = [
    ("2026-06-01", "Monday"), ("2026-06-05", "Friday"),
    ("2026-06-08", "Monday"), ("2026-06-12", "Friday"),
    ("2026-06-15", "Monday"), ("2026-06-19", "Friday"),
]
SWIM_REMOVE_DATES = {"2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"}


def clean(v) -> str:
    return str(v or "").strip()


def start_min(ts: str) -> int:
    m = re.match(r"(\d{1,2})(?:[.,](\d{2}))?", ts or "")
    if not m:
        return 99999
    h = int(m.group(1)); mn = int(m.group(2) or 0)
    base = 12 if h == 12 else (h + 12 if 1 <= h <= 6 else h)
    return base * 60 + mn


def is_home(s):
    return clean(s.get("client_name")).lower() in ("casa", "home") or clean(s.get("area")).upper() == "HOME"


def is_fadi(s):
    return clean(s.get("client_name")).lower() == "fadi"


def is_timi_swim(s):
    return clean(s.get("client_name")).lower() == "timi" and clean(s.get("time_slot")) == "12 to 12.30"


def is_timi_13(s):
    return clean(s.get("client_name")).lower() == "timi" and clean(s.get("time_slot")) == "1 to 3"


def find_timi_info(seed):
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            for d in st.get("days", []):
                for s in d.get("slots") or []:
                    if clean(s.get("client_name")).lower() == "timi" and clean(s.get("participant_info")):
                        return clean(s.get("participant_info"))
    return ""


def timi_13_slot(instructor, info):
    return {
        "time_slot": "1 to 3", "client_name": "Timi", "service": "Day Centre",
        "area": "Hub Room", "pool_note": "Hub Room", "venue": "SwimFarm",
        "instructors": instructor, "participant_info": info,
    }


def week_for_date(seed, date):
    for w in seed.get("weeks", []):
        if clean(w.get("start")) <= date <= clean(w.get("end")):
            return w
    return None


def ensure_staff_block(week, sk, name):
    for st in week.setdefault("staff", []):
        if clean(st.get("staffKey")).lower() == sk:
            return st
    st = {"staffKey": sk, "staffName": name, "venues": ["SwimFarm"], "days": []}
    week["staff"].append(st)
    return st


def ensure_day(week, block, date, weekday):
    for d in block.setdefault("days", []):
        if clean(d.get("sessionDate")) == date:
            return d
    d = {"sessionDate": date, "weekday": weekday, "slots": []}
    block["days"].append(d)
    block["days"].sort(key=lambda x: clean(x.get("sessionDate")))
    return d


def main():
    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    info = find_timi_info(seed)
    if not info:
        raise SystemExit("No participant_info de Timi")

    swim_removed = 0
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            if clean(st.get("staffKey")).lower() != "roberto":
                continue
            for d in st.get("days", []):
                if clean(d.get("sessionDate")) in SWIM_REMOVE_DATES:
                    n0 = len(d.get("slots") or [])
                    d["slots"] = [s for s in (d.get("slots") or []) if not is_timi_swim(s)]
                    swim_removed += n0 - len(d["slots"])

    names = {"victor": "Victor", "raul": "Raul"}
    added = []
    for date, weekday in TIMI_13:
        week = week_for_date(seed, date)
        if week is None:
            raise SystemExit(f"No hay week para {date}")
        for sk in ("victor", "raul"):
            block = ensure_staff_block(week, sk, names[sk])
            day = ensure_day(week, block, date, weekday)
            day["slots"] = [s for s in day["slots"]
                            if not is_home(s) and not is_fadi(s) and not is_timi_13(s)]
            day["slots"].append(timi_13_slot(names[sk].upper(), info))
            day["slots"].sort(key=lambda x: start_min(clean(x.get("time_slot"))))
            added.append(f"{date} {sk}")

    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Swims lunes quitados: {swim_removed}")
    print(f"Timi 1-3 añadido (victor+raul): {len(added)} entradas -> {sorted(set(a.split()[0] for a in added))}")
    print("Running sync…")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
