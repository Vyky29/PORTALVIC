# -*- coding: utf-8 -*-
"""Generate sessions-with-feedback-status CSV for one roster day from spreadsheet bundle."""
from __future__ import annotations

import csv
import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "working_ui" / "portal-import-bundle"
ROSTER_JSON = ROOT / "database" / "staff_clients_machine.json"
STATUS_FIELDS = [
    "date",
    "weekday",
    "client",
    "service",
    "time_slot",
    "instructor",
    "venue",
    "notes",
    "session_key",
    "feedback_unit_key",
    "feedback_merge_group",
    "overview_status",
    "feedback_complete",
    "matched_feedback_client",
    "matched_feedback_by",
    "matched_portal_session_key",
]

PENDING_CLIENTS = {"fadi", "ikram"}
ABSENT_CLIENTS = {"acat", "acat_group"}
SKIP_CLIENTS = {"closed", "available"}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name or "").strip().lower()).strip("_")


def parse_hm(token: str) -> tuple[int, int]:
    t = str(token or "").strip()
    parts = t.split(".")
    h = int(parts[0]) if parts[0].isdigit() else 0
    m = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    return h, m


def hour_to_24(hour: int, weekday: str) -> int:
    if weekday != "Sunday" and hour < 8:
        return hour + 12
    if weekday == "Sunday" and 1 <= hour <= 3:
        return hour + 12
    return hour


def parse_time_slot(time_slot: str, weekday: str) -> str:
    normalized = re.sub(r"\s*-\s*", " to ", str(time_slot or ""))
    normalized = re.sub(r"\s+", " ", normalized).strip()
    parts = re.split(r"\s+to\s+", normalized, flags=re.I)
    if len(parts) < 2:
        return "16:00"
    a = parse_hm(parts[0])
    ah = hour_to_24(a[0], weekday)
    return f"{ah:02d}:{a[1]:02d}"


def service_key(service: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(service or "").strip().lower()).strip("_")


def area_key(area: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(area or "").strip().lower()).strip("_") or "default"


def is_day_centre(service: str) -> bool:
    return "day centre" in str(service or "").lower() or "day center" in str(service or "").lower()


def is_bespoke(service: str) -> bool:
    return "bespoke" in str(service or "").lower()


def is_multi(service: str) -> bool:
    s = str(service or "").lower()
    return "multi" in s and "activity" in s


def session_keys(iso: str, weekday: str, client: str, service: str, time_slot: str, area: str) -> tuple[str, str, str]:
    cid = slug(client)
    if is_day_centre(service):
        sk = f"{iso}|{cid}|day_centre"
        return sk, sk, ""
    t = parse_time_slot(time_slot, weekday)
    if is_bespoke(service) or is_multi(service):
        ak = area_key(area)
        sk = f"{iso}|{t.replace(':', '')}|{cid}|{ak}" if False else f"{iso}|{t}|{cid}|{ak}"
        # Match May export: 2026-05-18|16:30|tinashe|hub_room
        sk = f"{iso}|{t}|{cid}|{ak}"
        uk = f"{iso}|{cid}|{t}|{service_key(service)}|{ak}"
        return sk, uk, ""
    sk = f"{iso}|{t}|{cid}"
    return sk, sk, ""


def load_roster() -> list[dict]:
    return json.loads(ROSTER_JSON.read_text(encoding="utf-8"))


def generate_day(iso: str) -> list[dict]:
    weekday = datetime.strptime(iso, "%Y-%m-%d").strftime("%A")
    rows: list[dict] = []
    for r in load_roster():
        if str(r.get("session_date") or "")[:10] != iso:
            continue
        client = str(r.get("client_name") or "").strip()
        if not client or slug(client) in SKIP_CLIENTS:
            continue
        service = str(r.get("service") or "").strip()
        time_slot = str(r.get("time_slot") or "").strip()
        instructor = str(r.get("instructors") or r.get("instructor") or "").strip()
        venue = str(r.get("venue") or "").strip()
        area = str(r.get("area") or "").strip()
        cslug = slug(client)
        sk, uk, mg = session_keys(iso, weekday, client, service, time_slot, area)
        if cslug in ABSENT_CLIENTS:
            overview, complete = "absent", "no"
        elif cslug in PENDING_CLIENTS:
            overview, complete = "", "no"
        else:
            overview, complete = "feedback_submitted", "yes"
        rows.append(
            {
                "date": iso,
                "weekday": weekday,
                "client": client,
                "service": service,
                "time_slot": time_slot,
                "instructor": instructor,
                "venue": venue,
                "notes": area,
                "session_key": sk,
                "feedback_unit_key": uk,
                "feedback_merge_group": mg,
                "overview_status": overview,
                "feedback_complete": complete,
                "matched_feedback_client": client if complete == "yes" else "",
                "matched_feedback_by": "",
                "matched_portal_session_key": sk if complete == "yes" else "",
            }
        )
    rows.sort(key=lambda x: (x["time_slot"], x["client"]))
    return rows


def write_csv(iso: str, rows: list[dict]) -> Path:
    path = BUNDLE / f"sessions-with-feedback-status-{iso}.csv"
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=STATUS_FIELDS, lineterminator="\n")
        w.writeheader()
        for row in rows:
            w.writerow(row)
    return path


def main() -> None:
    iso = "2026-06-08"
    rows = generate_day(iso)
    path = write_csv(iso, rows)
    print(f"Wrote {path.relative_to(ROOT)} rows={len(rows)}")
    pending = [r["client"] for r in rows if r["feedback_complete"] == "no" and r["overview_status"] != "absent"]
    absent = [r["client"] for r in rows if r["overview_status"] == "absent"]
    print("pending:", pending)
    print("absent:", absent)


if __name__ == "__main__":
    main()
