# -*- coding: utf-8 -*-
"""Merge session feedback into working_ui/portal/session_feedback_portal_data.js.

Baseline (kept unless a CSV row duplicates the same session):
  - SPREADSHEETS/v1SessionFeedback (PORTAL).xlsx when present, else existing session_feedback_portal_data.js

Extra tramos (e.g. 30 Apr–10 May, 11–19 May): drop CSV in database/feedback_imports/*.csv

Expected columns (same as v1SessionFeedback):
  Date, Client name, Instructor, Service, Attendance, Engagement, Emotions,
  Independence, Positive, Parent / challenges, Incidents

  python database/import_session_feedback_csv.py
"""
from __future__ import annotations

import csv
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMPORT_DIR = ROOT / "database" / "feedback_imports"
OUT = ROOT / "working_ui" / "portal" / "session_feedback_portal_data.js"
V1_XLSX = ROOT / "SPREADSHEETS" / "v1SessionFeedback (PORTAL).xlsx"
FIRST_DATE = "2026-04-13"
JS_PREFIX = "window.SESSION_FEEDBACK_PORTAL_SOURCE = "

# Roster uses full names (e.g. Adaam Ah); legacy feedback sheets often omit " Ah".
CANONICAL_CLIENT_ALIASES = {
    "aadam ah": "Aydaan Ah",
    "aadam": "Aydaan Ah",
    "adaam": "Adaam Ah",
    "adaam ah": "Adaam Ah",
}


def norm_instructor(name: str) -> str:
    return re.sub(r"\s+", " ", str(name or "").strip()).lower()


def canonical_participant_name(name: str) -> str:
    n = re.sub(r"\s+", " ", str(name or "").strip())
    if not n:
        return n
    return CANONICAL_CLIENT_ALIASES.get(n.lower(), n)


def norm_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (h or "").strip().lower()).strip("_")


def cell_date(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            from datetime import datetime as dt

            d = dt.strptime(s[:19] if " " in fmt else s, fmt).date()
            return d.isoformat()
        except ValueError:
            continue
    return None


def attendance_out(v):
    if v is None or str(v).strip() == "":
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v) if v != int(v) else int(v)
    return str(v).strip()


def engagement_out(v):
    if v is None or str(v).strip() == "":
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    s = str(v).strip()
    try:
        return float(s)
    except ValueError:
        return s


def canonical_portal_service(raw: str) -> str:
    from export_session_feedback_portal_js import canonical_portal_service as cps

    return cps(raw)


def row_from_dict(raw: dict, source: str) -> dict | None:
    keys = {norm_header(k): (k, v) for k, v in raw.items()}

    def pick(*names):
        for n in names:
            nk = norm_header(n)
            if nk in keys:
                return keys[nk][1]
        return None

    d_iso = cell_date(pick("date", "session_date"))
    name = canonical_participant_name(
        str(
            pick("client_name", "client name", "client", "clients_name", "clients name")
            or ""
        ).strip()
    )
    if not d_iso or not name or d_iso < FIRST_DATE:
        return None
    service_raw = str(pick("service", "programme") or "").strip()
    return {
        "clientName": name,
        "date": d_iso,
        "service": canonical_portal_service(service_raw) if service_raw else "—",
        "attendance": attendance_out(pick("attendance")),
        "engagement": engagement_out(
            pick("engagement", "engagement_rating", "engagement rating")
        ),
        "emotions": str(pick("emotions", "client_emotions", "client_s_emotions") or "").strip()
        or None,
        "positive": str(
            pick("positive", "positive_feedback", "positive_feedback_optional") or ""
        ).strip()
        or None,
        "relevantParent": str(
            pick(
                "parent_challenges",
                "parent / challenges",
                "relevantparent",
                "relevant_information",
                "exceptional_challenges_or_parent_info_optional",
                "notes",
            )
            or ""
        ).strip()
        or None,
        "incidentsNotes": str(
            pick(
                "incidents",
                "incidentsnotes",
                "exceptional_challenges",
                "did_any_incidents_occur",
            )
            or ""
        ).strip()
        or None,
        "instructor": str(
            pick(
                "instructor",
                "instructors",
                "completed_by_name",
                "feedback_completed_by",
            )
            or ""
        ).strip()
        or None,
        "independence": str(
            pick("independence", "engagement_patterns", "engagement_patterns_optional")
            or ""
        ).strip()
        or None,
        "sessionTimeSlot": str(
            pick("session_time", "session_time_slot", "time_slot", "slot")
            or ""
        ).strip()
        or None,
        "portalSessionKey": str(
            pick("portal_session_key", "portal session key", "matched_portal_session_key")
            or ""
        ).strip()
        or None,
        "submittedAt": str(pick("created_at", "submitted_at", "exported_at") or "").strip()
        or None,
        "_source": source,
    }


def _header_map(header_row: tuple) -> dict[str, int]:
    out: dict[str, int] = {}
    for i, h in enumerate(header_row):
        if h is None:
            continue
        nk = norm_header(str(h))
        if nk:
            out[nk] = i
    return out


def _pick_col(hmap: dict[str, int], row: tuple, *names: str):
    for n in names:
        i = hmap.get(norm_header(n))
        if i is not None and i < len(row):
            return row[i]
    return None


def read_xlsx_rows(path: Path) -> list[dict]:
    """v1 layout (Date col A) or emoji-header export (Clients name / Date in row 1)."""
    import openpyxl

    from export_session_feedback_portal_js import read_workbook_rows

    rows_v1, _ = read_workbook_rows(path)
    if rows_v1:
        return rows_v1

    wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
    ws = wb.active
    all_rows = [tuple(r) for r in ws.iter_rows(values_only=True)]
    wb.close()

    header_idx = None
    hmap: dict[str, int] = {}
    for i, row in enumerate(all_rows[:5]):
        if not row:
            continue
        hm = _header_map(row)
        if "date" in hm or "session_date" in hm:
            if any(
                k in hm
                for k in (
                    "client_name",
                    "clients_name",
                    "clients_name",
                    "client",
                )
            ) or "clients_name" in str(row).lower():
                header_idx = i
                hmap = hm
                break
            if "clients" in "".join(hm.keys()) and "date" in hm:
                header_idx = i
                hmap = hm
                break

    if header_idx is None:
        return []

    out: list[dict] = []
    for row in all_rows[header_idx + 1 :]:
        if not row:
            continue
        raw = {
            "Date": _pick_col(hmap, row, "date"),
            "Client name": _pick_col(
                hmap, row, "client_name", "clients_name", "clients name", "client"
            ),
            "Instructor": _pick_col(
                hmap,
                row,
                "instructor",
                "feedback_completed_by",
                "feedback_completed_by_name",
            ),
            "Service": _pick_col(hmap, row, "service"),
            "Attendance": _pick_col(hmap, row, "attendance"),
            "Engagement": _pick_col(hmap, row, "engagement"),
            "Emotions": _pick_col(hmap, row, "emotions", "client_emotions"),
            "Positive": _pick_col(hmap, row, "positive", "positive_feedback"),
            "Parent / challenges": _pick_col(
                hmap,
                row,
                "parent / challenges",
                "exceptional_challenges",
                "relevant_information",
            ),
            "Incidents": _pick_col(hmap, row, "incidents", "did_any_incidents_occur"),
        }
        parsed = row_from_dict(raw, path.name)
        if parsed:
            parsed.pop("_source", None)
            out.append(parsed)
    return out


def read_csv_dicts(path: Path) -> list[dict]:
    for enc in ("utf-8-sig", "utf-16", "utf-16-le", "cp1252"):
        try:
            text = path.read_text(encoding=enc)
            return list(csv.DictReader(text.splitlines()))
        except UnicodeDecodeError:
            continue
    text = path.read_text(encoding="utf-8", errors="replace")
    return list(csv.DictReader(text.splitlines()))


def dedupe_key(r: dict) -> tuple:
    psk = str(r.get("portalSessionKey") or "").strip()
    if psk:
        return (
            "psk",
            r.get("date"),
            psk.lower(),
            norm_instructor(r.get("instructor")),
        )
    return (
        "legacy",
        r.get("date"),
        str(r.get("clientName") or "").lower(),
        norm_instructor(r.get("instructor")),
        str(r.get("service") or "").lower(),
        str(r.get("attendance") or "").lower(),
    )


def load_baseline_rows(*, allow_existing_js: bool = True) -> tuple[list[dict], str]:
    """v1 workbook if on disk; otherwise rows already deployed in session_feedback_portal_data.js."""
    if V1_XLSX.is_file():
        from export_session_feedback_portal_js import read_workbook_rows

        rows, _sheet = read_workbook_rows(V1_XLSX)
        return rows, str(V1_XLSX.relative_to(ROOT)).replace("\\", "/")

    if allow_existing_js and OUT.is_file():
        text = OUT.read_text(encoding="utf-8")
        if JS_PREFIX in text:
            payload = json.loads(text.split(JS_PREFIX, 1)[1].strip().rstrip(";"))
            rows = payload.get("rows") or []
            src = (payload.get("meta") or {}).get("sourceFile") or OUT.name
            return list(rows), src

    return [], "none"


def _bundle_feedback_csv() -> Path | None:
    p = ROOT / "database" / "portal_import_bundle" / "session-feedback.csv"
    if p.is_file():
        return p
    p2 = ROOT / "working_ui" / "portal-import-bundle" / "session-feedback.csv"
    return p2 if p2.is_file() else None


def _dates_in_bundle_feedback(path: Path) -> set[str]:
    dates: set[str] = set()
    for raw in read_csv_dicts(path):
        keys = {norm_header(k): v for k, v in raw.items()}
        d_raw = keys.get("session_date") or keys.get("date")
        d_iso = cell_date(d_raw)
        if d_iso:
            dates.add(d_iso)
    return dates


def _collect_import_paths() -> tuple[list[Path], list[Path]]:
    csv_paths: list[Path] = []
    xlsx_paths: list[Path] = []
    if IMPORT_DIR.is_dir():
        csv_paths.extend(sorted(IMPORT_DIR.glob("*.csv")))
        xlsx_paths.extend(sorted(IMPORT_DIR.glob("*.xlsx")))
    bundle_fb = ROOT / "database" / "portal_import_bundle" / "session-feedback.csv"
    if bundle_fb.is_file():
        csv_paths.append(bundle_fb)

    seen: set[str] = set()
    csv_out: list[Path] = []
    xlsx_out: list[Path] = []
    for p in csv_paths + xlsx_paths:
        key = str(p.resolve()).lower()
        if key in seen or p.name.startswith("_"):
            continue
        seen.add(key)
        if p.suffix.lower() == ".csv":
            csv_out.append(p)
        else:
            xlsx_out.append(p)
    return csv_out, xlsx_out


def import_csv_files() -> int:
    csv_paths, xlsx_paths = _collect_import_paths()
    bundle_fb = _bundle_feedback_csv()
    allow_js = bundle_fb is None
    baseline, baseline_src = load_baseline_rows(allow_existing_js=allow_js)
    bundle_dates = _dates_in_bundle_feedback(bundle_fb) if bundle_fb else set()
    if not baseline and not csv_paths and not xlsx_paths:
        print("No baseline (v1 xlsx or existing JS) and no imports in feedback_imports/ or working_ui/.")
        return 0

    by_key: dict[tuple, dict] = {}
    for row in baseline:
        if str(row.get("date") or "") in bundle_dates:
            continue
        by_key[dedupe_key(row)] = {k: v for k, v in row.items() if k != "_source"}

    for path in xlsx_paths:
        for row in read_xlsx_rows(path):
            if str(row.get("date") or "") in bundle_dates:
                continue
            by_key[dedupe_key(row)] = row

    bundle_csv_paths = [p for p in csv_paths if p.name == "session-feedback.csv"]
    other_csv_paths = [p for p in csv_paths if p.name != "session-feedback.csv"]
    for path in other_csv_paths:
        for raw in read_csv_dicts(path):
            row = row_from_dict(raw, path.name)
            if not row:
                continue
            row.pop("_source", None)
            by_key[dedupe_key(row)] = row

    for path in bundle_csv_paths:
        for raw in read_csv_dicts(path):
            row = row_from_dict(raw, path.name)
            if not row:
                continue
            row.pop("_source", None)
            by_key[dedupe_key(row)] = row

    rows = sorted(by_key.values(), key=lambda r: (r["date"], r["clientName"] or ""), reverse=True)
    sources = [baseline_src]
    extra = [p.name for p in xlsx_paths + csv_paths]
    if extra:
        sources.append(", ".join(extra))
    dates = sorted({r["date"] for r in rows})
    meta = {
        "sourceFile": " + ".join(s for s in sources if s and s != "none"),
        "sheet": "v1 + xlsx + CSV merge",
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "rowCount": len(rows),
        "coverageFromIso": FIRST_DATE,
        "coverageThroughIso": dates[-1] if dates else None,
        "sourceNote": "v1 (13-30 Apr) + 30 Apr-10 May xlsx + 11-19 May CSV; later files override duplicates",
    }
    payload = {"meta": meta, "rows": rows}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        f.write("window.SESSION_FEEDBACK_PORTAL_SOURCE = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"Wrote {OUT} rows={len(rows)}")
    return len(rows)


if __name__ == "__main__":
    import_csv_files()
