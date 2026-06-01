# -*- coding: utf-8 -*-
"""Normalize roster participant → Yusuf Ah; staff → Youssef (never Yusef/Yusuf for child).

Re-run: python database/patch_roster_yusuf_youssef_names.py
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "database"
ROSTER_WEEKS = DB / "roster_weeks"

CLIENT_CANONICAL = "Yusuf Ah"
STAFF_CANONICAL = "Youssef"

# client_name values that refer to Yusuf Ahmed (participant), not staff.
CLIENT_ALIASES = frozenset({"Yusuf", "Yusef", "Yusuf Ah", "Yusuf Ahmed"})

BUNDLE_PATHS = [
    DB / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "portal" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "portal-shared-js" / "staff_dashboard_spreadsheet_bundle.js",
]

LOGIN_MAP_PATHS = [
    DB / "staff_login_map.json",
    DB / "staff_login_map.js",
    DB / "auth-map.js",
    ROOT / "working_ui" / "staff_login_map.json",
    ROOT / "working_ui" / "portal" / "auth-map.js",
    ROOT / "working_ui" / "portal-shared-js" / "auth-map.js",
]


def norm_client(name: str) -> str:
    t = str(name or "").strip()
    if t in CLIENT_ALIASES:
        return CLIENT_CANONICAL
    return t


def norm_staff_name(name: str) -> str:
    t = str(name or "").strip()
    if t.lower() in ("yusef", "yousef", "youssef"):
        return STAFF_CANONICAL
    return t


def patch_staff_clients_csv(path: Path) -> int:
    if not path.exists():
        return 0
    rows = list(csv.reader(path.read_text(encoding="utf-8").splitlines()))
    if not rows:
        return 0
    n = 0
    out = [rows[0]]
    for row in rows[1:]:
        if len(row) >= 2:
            before = row[1]
            row[1] = norm_client(before)
            if row[1] != before:
                n += 1
        out.append(row)
    path.write_text("\n".join(",".join(r) for r in out) + "\n", encoding="utf-8")
    return n


def patch_staff_clients_json(path: Path) -> int:
    if not path.exists():
        return 0
    rows = json.loads(path.read_text(encoding="utf-8"))
    n = 0
    for row in rows:
        before = row.get("client_name", "")
        after = norm_client(before)
        if after != before:
            row["client_name"] = after
            n += 1
    path.write_text(json.dumps(rows, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    return n


def patch_roster_week_csv(path: Path) -> int:
    if not path.exists():
        return 0
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines:
        return 0
    n = 0
    out = [lines[0]]
    for line in lines[1:]:
        if not line.strip():
            continue
        parts = line.split(",")
        if len(parts) >= 3:
            before = parts[2]
            after = norm_client(before)
            if after != before:
                parts[2] = after
                n += 1
            out.append(",".join(parts))
        else:
            out.append(line)
    path.write_text("\n".join(out) + ("\n" if text.endswith("\n") else ""), encoding="utf-8")
    return n


def patch_timetable_csv(path: Path) -> int:
    if not path.exists():
        return 0
    rows = list(csv.reader(path.read_text(encoding="utf-8").splitlines()))
    if not rows:
        return 0
    n = 0
    out = [rows[0]]
    for row in rows[1:]:
        if len(row) >= 4:
            for idx in (2, 3):
                before = row[idx]
                after = norm_staff_name(before)
                if after != before:
                    row[idx] = after
                    n += 1
            raw = row[2] if len(row) > 2 else ""
            if raw and "Yusef" in raw:
                row[2] = re.sub(r"\bYusef\b", STAFF_CANONICAL, raw)
        out.append(row)
    path.write_text("\n".join(",".join(r) for r in out) + "\n", encoding="utf-8")
    return n


def patch_timetable_json(path: Path) -> int:
    if not path.exists():
        return 0
    rows = json.loads(path.read_text(encoding="utf-8"))
    n = 0
    for row in rows:
        for key in ("staff_name", "raw_assignment"):
            if key not in row:
                continue
            before = str(row[key] or "")
            after = before
            after = re.sub(r"\bYusef\b", STAFF_CANONICAL, after)
            after = re.sub(r"\bYousef\b", STAFF_CANONICAL, after)
            if key == "staff_name":
                after = norm_staff_name(after)
            if after != before:
                row[key] = after
                n += 1
    path.write_text(json.dumps(rows, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    return n


def patch_bundle_js(path: Path) -> int:
    if not path.exists():
        return 0
    src = path.read_text(encoding="utf-8")
    n = 0

    def repl_client(m: re.Match) -> str:
        nonlocal n
        val = m.group(1)
        if val in CLIENT_ALIASES and val != CLIENT_CANONICAL:
            n += 1
            return f'"client_name": "{CLIENT_CANONICAL}"'
        return m.group(0)

    src = re.sub(r'"client_name":\s*"([^"]+)"', repl_client, src)
    path.write_text(src, encoding="utf-8")
    return n


def patch_apply_term_roster_py(path: Path) -> int:
    if not path.exists():
        return 0
    src = path.read_text(encoding="utf-8")
    before = src
    src = src.replace('r("Yusuf", "Sunday"', f'r("{CLIENT_CANONICAL}", "Sunday"')
    src = src.replace('r("Yusef", "Sunday"', f'r("{CLIENT_CANONICAL}", "Sunday"')
    if src != before:
        path.write_text(src, encoding="utf-8")
        return 1
    return 0


def patch_login_maps() -> int:
    n = 0
    for path in LOGIN_MAP_PATHS:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        before = text
        if path.suffix == ".json":
            data = json.loads(text)
            m = data.get("staff_username_to_email") or data
            if isinstance(m, dict):
                email = m.get("Youssef") or m.get("Yusef")
                if email:
                    m["Youssef"] = email
                m.pop("Yusef", None)
                data["staff_username_to_email"] = m
                text = json.dumps(data, ensure_ascii=True, indent=2) + "\n"
        else:
            text = re.sub(r'\n\s*Yusef:\s*"[^"]+",?\n', "\n", text)
            if "Youssef:" not in text and "stf005" in text:
                pass
        if text != before:
            path.write_text(text, encoding="utf-8")
            n += 1
    return n


def sync_bundles_from_db_json() -> None:
    """Replace rows[] in all bundle copies from staff_clients_machine.json."""
    json_path = DB / "staff_clients_machine.json"
    if not json_path.exists():
        return
    rows = json.loads(json_path.read_text(encoding="utf-8"))
    rows_json = json.dumps(rows, ensure_ascii=True, indent=2)
    for bundle_path in BUNDLE_PATHS:
        if not bundle_path.exists():
            continue
        src = bundle_path.read_text(encoding="utf-8")
        needle = '"rows":'
        i = src.find(needle)
        if i < 0:
            continue
        j = src.find("[", i)
        if j < 0:
            continue
        depth = 0
        k = j
        end = -1
        while k < len(src):
            c = src[k]
            if c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    end = k + 1
                    break
            k += 1
        if end < 0:
            continue
        bundle_path.write_text(src[:j] + rows_json + src[end:], encoding="utf-8")


def main() -> None:
    stats: dict[str, int] = {}

    stats["staff_clients_csv"] = patch_staff_clients_csv(DB / "staff_clients_machine.csv")
    stats["staff_clients_json"] = patch_staff_clients_json(DB / "staff_clients_machine.json")
    stats["timetable_csv"] = patch_timetable_csv(DB / "staff_timetable_machine.csv")
    stats["timetable_json"] = patch_timetable_json(DB / "staff_timetable_machine.json")
    stats["apply_term_py"] = patch_apply_term_roster_py(DB / "apply_term_roster_jun_jul_2026.py")

    week_n = 0
    if ROSTER_WEEKS.is_dir():
        for csv_path in sorted(ROSTER_WEEKS.glob("*.csv")):
            week_n += patch_roster_week_csv(csv_path)
    stats["roster_week_csv"] = week_n

    bundle_n = 0
    for bp in BUNDLE_PATHS:
        bundle_n += patch_bundle_js(bp)
    stats["bundle_js"] = bundle_n

    sync_bundles_from_db_json()
    stats["login_maps"] = patch_login_maps()

    print("patch_roster_yusuf_youssef_names:", stats)


if __name__ == "__main__":
    main()
