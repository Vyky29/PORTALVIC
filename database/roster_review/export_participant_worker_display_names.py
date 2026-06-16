# -*- coding: utf-8 -*-
"""
Export participant worker display names for roster review.

Source of truth for the dashboard column: Clients Info (PORTAL) — what staff see on session cards.
Both columns start equal; edit nombre_completo later for admin / registration full names.

  python database/roster_review/export_participant_worker_display_names.py
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLIENTS_INFO_JS = ROOT / "working_ui" / "clients_info_embed.js"
BUNDLE_JS = ROOT / "working_ui" / "portal" / "staff_dashboard_spreadsheet_bundle.js"
OUT_CSV = Path(__file__).resolve().parent / "participant-worker-display-names.csv"

SKIP = {"closed", "acat", "acat group", "available", "no client", "q6 college"}


def load_clients_info() -> list[str]:
    text = CLIENTS_INFO_JS.read_text(encoding="utf-8")
    m = re.search(r"window\.PORTAL_CLIENTS_INFO_ROWS = (\[[\s\S]*?\]);", text)
    if not m:
        raise SystemExit(f"Could not parse {CLIENTS_INFO_JS}")
    rows = json.loads(m.group(1))
    out: list[str] = []
    seen: set[str] = set()
    for row in rows:
        name = str(row.get("client_name") or "").strip()
        key = name.lower()
        if not name or key in seen or key in SKIP:
            continue
        seen.add(key)
        out.append(name)
    return sorted(out, key=lambda s: s.casefold())


def load_roster_only(clients_info: list[str]) -> list[str]:
    text = BUNDLE_JS.read_text(encoding="utf-8")
    m = re.search(r'"rows"\s*:\s*(\[[\s\S]*?\])\s*,\s*"staffProfiles"', text)
    if not m:
        return []
    rows = json.loads(m.group(1))
    ci = {n.casefold() for n in clients_info}
    extra: list[str] = []
    seen: set[str] = set()
    for row in rows:
        name = str(row.get("client_name") or "").strip()
        key = name.casefold()
        if not name or key in ci or key in seen or key in SKIP:
            continue
        if "trial" in key or key == "no client":
            continue
        seen.add(key)
        extra.append(name)
    return sorted(extra, key=lambda s: s.casefold())


def main() -> None:
    dashboard_names = load_clients_info()
    roster_only = load_roster_only(dashboard_names)
    rows: list[tuple[str, str, str]] = []
    for name in dashboard_names:
        rows.append((name, name, "clients_info"))
    for name in roster_only:
        rows.append((name, name, "roster_only"))
    rows.sort(key=lambda r: r[0].casefold())

    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["nombre_completo", "nombre_dashboard", "fuente"])
        w.writerows(rows)

    print(f"Wrote {len(rows)} rows → {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
