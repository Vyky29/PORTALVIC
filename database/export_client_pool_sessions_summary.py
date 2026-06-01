"""Export client pool session lines for ops review. Run: python database/export_client_pool_sessions_summary.py"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROWS_PATH = ROOT / "database" / "staff_clients_machine.json"
INFO_PATH = ROOT / "database" / "clients_info_machine.json"
OUT_PATH = ROOT / ".tmp_client_pool_notes.txt"


def main() -> None:
    rows = json.loads(ROWS_PATH.read_text(encoding="utf-8"))
    info_rows = json.loads(INFO_PATH.read_text(encoding="utf-8"))
    info = {
        r["client_name"].strip().lower(): str(r.get("client_info", "")).strip()
        for r in info_rows
    }

    by_client: dict[str, list] = defaultdict(list)
    for r in rows:
        cn = str(r.get("client_name", "")).strip()
        if not cn or cn.lower() == "closed":
            continue
        by_client[cn.lower()].append(r)

    pool_kw = ("pool", "lane")
    lines_out: list[str] = [
        "PORTAL — Client pool sessions (roster area per slot)",
        "Source: database/staff_clients_machine.json + clients_info_machine.json",
        "Each bullet = unique day / time / instructor / area",
        "",
    ]

    for key in sorted(by_client.keys(), key=lambda k: by_client[k][0].get("client_name", "").lower()):
        sessions = by_client[key]
        name = sessions[0].get("client_name", key)
        pool_sess = []
        for s in sessions:
            area = str(s.get("area", "")).strip()
            venue = str(s.get("venue", "")).strip().lower()
            if any(p in area.lower() for p in pool_kw) or venue in (
                "swimfarm",
                "acton",
                "northolt",
                "westway",
            ):
                pool_sess.append(s)
        if not pool_sess:
            continue

        seen: set[tuple] = set()
        slot_lines: list[tuple] = []
        for s in sorted(
            pool_sess,
            key=lambda x: (
                x.get("day", ""),
                x.get("time_slot", ""),
                x.get("instructors", ""),
                x.get("area", ""),
            ),
        ):
            sig = (
                s.get("day"),
                s.get("time_slot"),
                s.get("instructors"),
                s.get("area"),
                s.get("service"),
                s.get("venue"),
            )
            if sig in seen:
                continue
            seen.add(sig)
            slot_lines.append(sig)

        lines_out.append(f"## {name}")
        note = info.get(name.lower(), "")
        if note:
            short = note.replace("\n", " ")
            if len(short) > 200:
                short = short[:200] + "..."
            lines_out.append(f"Info sheet: {short}")
        for day, time, inst, area, svc, venue in slot_lines:
            area_disp = area if area else "-"
            lines_out.append(
                f"  - {day} {time} | {inst} | {area_disp} | {svc} @ {venue}"
            )
        lines_out.append("")

    OUT_PATH.write_text("\n".join(lines_out), encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(lines_out)} lines)")


if __name__ == "__main__":
    main()
