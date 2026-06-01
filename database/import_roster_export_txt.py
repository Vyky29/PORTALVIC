# -*- coding: utf-8 -*-
"""Replace undated roster template rows from database/_tmp_roster_export.txt."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / "database" / "_tmp_roster_export.txt"
JSON_PATH = ROOT / "database" / "staff_clients_machine.json"

DAYS = {
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
}

# Javier / Roberto: one swimming feedback (Aquatic + MA pool). Omit the shorter Aquatic-only row on staff Today.
SWIM_FEEDBACK_OMIT = [
    {
        "weekday": "Wednesday",
        "client_slug": "cyrus",
        "time_slot": "4 to 4.30",
        "service": "Aquatic Activity",
    },
]


def norm_text(v: str) -> str:
    return re.sub(r"\s+", " ", str(v or "").replace("\t", " ").strip())


def norm_instructors(raw: str) -> str:
    t = norm_text(raw)
    if not t:
        return t
    parts = [p.strip() for p in re.split(r"\s*,\s*", t) if p.strip()]
    return ", ".join(p.upper() for p in parts)


def parse_export(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    rows: list[dict] = []
    day = ""
    service = ""
    for line in text.splitlines():
        line = line.rstrip()
        if not line.strip():
            continue
        m_day = re.match(r"^=+\s*$", line)  # skip separator-only handled below
        if line.startswith("===="):
            continue
        upper = line.strip().upper()
        if upper in DAYS:
            day = upper.title()
            if day == "Wednesday":
                day = "Wednesday"
            continue
        svc_m = re.match(r"^---\s*(.+?)\s*---\s*$", line)
        if svc_m:
            cand = norm_text(svc_m.group(1))
            if re.search(r"[A-Za-z]", cand):
                service = cand
            continue
        if line.startswith("Cliente |") or line.startswith("---"):
            continue
        if upper.startswith("TEFLON"):
            break
        if "|" not in line:
            continue
        parts = [norm_text(p) for p in line.split("|")]
        if len(parts) < 5:
            continue
        client, area, instructors, time_slot, venue = parts[:5]
        if not client or not time_slot:
            continue
        rows.append(
            {
                "client_name": client,
                "day": day,
                "instructors": norm_instructors(instructors),
                "service": service,
                "area": norm_text(area),
                "time_slot": norm_text(time_slot),
                "venue": norm_text(venue),
            }
        )
    return rows


def main() -> None:
    if not EXPORT.exists():
        raise SystemExit(f"Missing export: {EXPORT}")
    template = parse_export(EXPORT)
    if not template:
        raise SystemExit("No template rows parsed from export")

    existing = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    dated = [r for r in existing if r.get("session_date")]
    merged = dated + template
    JSON_PATH.write_text(json.dumps(merged, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(merged)} rows ({len(dated)} dated + {len(template)} template) -> {JSON_PATH}")


if __name__ == "__main__":
    main()
