# -*- coding: utf-8 -*-
"""Export venue reviews for admin Day Operations (static JS + optional CSV).

Sources (in order):
  1. working_ui/portal-import-bundle/venue-reviews.csv (manual / Supabase export)
  2. Roster weeks in portal-import-bundle/sessions-with-feedback-status-*.csv
     (one Opening + Closing per venue per calendar day, May 2026 term window)

  python database/export_venue_reviews_portal_js.py
"""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "working_ui" / "portal-import-bundle"
BUNDLE_CANON = ROOT / "database" / "portal_import_bundle"
OUT_JS = ROOT / "working_ui" / "portal" / "venue_reviews_portal_data.js"
OUT_CSV = BUNDLE / "venue-reviews.csv"

DATE_FROM = "2026-05-11"
DATE_TO = "2026-05-22"

INSTRUCTOR_DISPLAY = {
    "ROBERTO": "Roberto Reali",
    "JAVIER": "Javier Marquez",
    "JAVIER A": "Javier Arranz",
    "YOUSSEF": "Youssef Benabdelhak",
    "VICTOR": "Victor Matilla",
    "VICTOR, LULIA": "Victor Matilla",
    "RAUL": "Raul Salvador Gallego",
    "DAN": "Dan",
    "AURORA": "Aurora",
    "GIUSEPPE": "Giuseppe",
    "GODSWAY": "Godsway",
    "JOHN": "John",
    "BISMARK": "Bismark",
    "CARLOS": "Carlos",
    "SANDRA": "Sandra",
    "ANGEL": "Angel",
    "BERTA": "Berta",
    "ALEX": "Alex Stone",
    "LULIA": "Lulia",
}

OPENING_TIME = {
    "SwimFarm": "08:45",
    "Acton": "08:00",
    "Northolt": "08:00",
    "Westway": "09:00",
}
CLOSING_TIME = {
    "SwimFarm": "15:15",
    "Acton": "18:30",
    "Northolt": "17:00",
    "Westway": "17:30",
}


def _bundle_dir() -> Path:
    return BUNDLE if BUNDLE.is_dir() else BUNDLE_CANON


def _title_instructor(code: str) -> str:
    c = re.sub(r"\s+", " ", (code or "").strip())
    if not c:
        return "Portal staff"
    up = c.upper()
    if up in INSTRUCTOR_DISPLAY:
        return INSTRUCTOR_DISPLAY[up]
    if "," in c:
        first = c.split(",")[0].strip().upper()
        if first in INSTRUCTOR_DISPLAY:
            return INSTRUCTOR_DISPLAY[first]
    parts = [p.capitalize() for p in c.replace(",", " ").split() if p]
    return " ".join(parts) if parts else c


def _row_from_csv(raw: dict) -> dict | None:
    d = str(raw.get("review_date") or raw.get("date") or "").strip()[:10]
    if not d or d < DATE_FROM or d > DATE_TO:
        return None
    venue = str(raw.get("venue") or "").strip()
    if not venue:
        return None
    oc = str(raw.get("opening_or_closing") or raw.get("kind") or "").strip()
    if oc.lower() in ("open", "opening"):
        oc = "Opening"
    elif oc.lower() in ("close", "closing"):
        oc = "Closing"
    if oc not in ("Opening", "Closing"):
        return None
    hi = str(raw.get("has_issues") or "No").strip()
    if hi.lower() in ("yes", "true", "1"):
        hi = "Yes"
    else:
        hi = "No"
    issues = str(raw.get("issues_reported") or raw.get("issues") or "").strip() or None
    t = str(raw.get("review_time") or raw.get("time") or "").strip() or (
        OPENING_TIME.get(venue, "08:00") if oc == "Opening" else CLOSING_TIME.get(venue, "18:00")
    )
    who = str(raw.get("submitted_by_name") or raw.get("submitted_by") or "").strip() or "Portal staff"
    created = str(raw.get("created_at") or "").strip()
    if not created:
        created = f"{d}T12:00:00Z"
    return {
        "review_date": d,
        "venue": venue,
        "opening_or_closing": oc,
        "review_time": t,
        "has_issues": hi,
        "issues_reported": issues,
        "submitted_by_name": who,
        "created_at": created,
    }


def _load_csv_rows(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    out: list[dict] = []
    for raw in csv.DictReader(path.read_text(encoding="utf-8-sig").splitlines()):
        row = _row_from_csv(raw)
        if row:
            out.append(row)
    return out


def _dedupe_key(r: dict) -> tuple:
    return (
        r.get("review_date") or "",
        (r.get("venue") or "").strip().lower(),
        r.get("opening_or_closing") or "",
    )


def _build_from_status_csvs(bundle: Path) -> list[dict]:
    by_day_venue: dict[tuple, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for path in sorted(bundle.glob("sessions-with-feedback-status-*.csv")):
        for raw in csv.DictReader(path.read_text(encoding="utf-8-sig").splitlines()):
            d = str(raw.get("date") or "").strip()[:10]
            if not d or d < DATE_FROM or d > DATE_TO:
                continue
            venue = str(raw.get("venue") or "").strip()
            if not venue:
                continue
            inst = str(raw.get("instructor") or "").strip() or "Portal staff"
            by_day_venue[(d, venue)][inst] += 1

    rows: list[dict] = []
    for (d, venue), counts in sorted(by_day_venue.items()):
        top = max(counts.items(), key=lambda x: x[1])[0]
        who = _title_instructor(top)
        for oc in ("Opening", "Closing"):
            t = OPENING_TIME.get(venue, "08:00") if oc == "Opening" else CLOSING_TIME.get(venue, "18:00")
            rows.append(
                {
                    "review_date": d,
                    "venue": venue,
                    "opening_or_closing": oc,
                    "review_time": t,
                    "has_issues": "No",
                    "issues_reported": None,
                    "submitted_by_name": who,
                    "created_at": f"{d}T12:00:00Z",
                }
            )
    return rows


def _write_csv(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "review_date",
        "venue",
        "opening_or_closing",
        "review_time",
        "has_issues",
        "issues_reported",
        "submitted_by_name",
        "created_at",
    ]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in sorted(rows, key=lambda x: (x["review_date"], x["venue"], x["opening_or_closing"])):
            w.writerow({k: r.get(k) or "" for k in fields})


def export_venue_reviews_js() -> int:
    bundle = _bundle_dir()
    by_key: dict[tuple, dict] = {}

    for row in _build_from_status_csvs(bundle):
        by_key[_dedupe_key(row)] = row

    csv_path = bundle / "venue-reviews.csv"
    for row in _load_csv_rows(csv_path):
        by_key[_dedupe_key(row)] = row

    rows = sorted(
        by_key.values(),
        key=lambda r: (r["review_date"], r["venue"], r["opening_or_closing"]),
        reverse=True,
    )
    _write_csv(rows, OUT_CSV)
    if BUNDLE_CANON.is_dir() and OUT_CSV.is_file():
        canon_csv = BUNDLE_CANON / "venue-reviews.csv"
        canon_csv.write_text(OUT_CSV.read_text(encoding="utf-8"), encoding="utf-8")

    meta = {
        "sourceFiles": [
            "portal-import-bundle/venue-reviews.csv",
            "sessions-with-feedback-status-2026-05-13_19.csv",
            "sessions-with-feedback-status-2026-05-18_22.csv",
        ],
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "rowCount": len(rows),
        "coverageFromIso": DATE_FROM,
        "coverageThroughIso": DATE_TO,
        "sourceNote": "CSV overrides roster-derived Opening/Closing rows per venue-day (last two May 2026 weeks)",
    }
    payload = {"meta": meta, "rows": rows}
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    with OUT_JS.open("w", encoding="utf-8") as f:
        f.write("window.VENUE_REVIEWS_PORTAL_SOURCE = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"Wrote {OUT_JS.relative_to(ROOT)} rows={len(rows)}")
    print(f"Wrote {OUT_CSV.relative_to(ROOT)}")
    return len(rows)


if __name__ == "__main__":
    export_venue_reviews_js()
