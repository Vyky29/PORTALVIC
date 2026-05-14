# -*- coding: utf-8 -*-
"""Read **only** SPREADSHEETS/v1SessionFeedback (PORTAL).xlsx → working_ui/ELEMENTOR/MEDIOS/session_feedback_portal_data.js.

The older working_ui/SessionFeedback (PORTAL).xlsx is **not** used. v1 coverage starts **2026-04-13** (rows
before that date are skipped even if present in the file).

Column layout (row 1 = headers, data from row 2):
  0 Date, 1 Client name, 2 Instructor, 3 Service, 4 Attendance, 5 Engagement,
  6 Emotions, 7 Independence, 8 Positive, 9 Parent / challenges, 10 Incidents.
"""
import json
import os
import re
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Inclusive first calendar day for portal rows (v1 spreadsheet scope).
PORTAL_SESSION_FEEDBACK_FIRST_DATE_ISO = "2026-04-13"
# **Only** this workbook feeds the admin portal session-feedback grid / Session Overview matching.
_DEFAULT_XLSX = ROOT / "SPREADSHEETS" / "v1SessionFeedback (PORTAL).xlsx"
XLSX = Path(os.environ.get("SESSION_FEEDBACK_PORTAL_XLSX", str(_DEFAULT_XLSX)))
OUT = ROOT / "working_ui" / "ELEMENTOR" / "MEDIOS" / "session_feedback_portal_data.js"


def cell_date(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return str(v).strip() or None


def norm_str(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def attendance_out(v):
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v) if v == int(v) else float(v)
    s = str(v).strip()
    if not s:
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return s


def engagement_out(v):
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    s = str(v).strip()
    if not s:
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return s


def canonical_portal_service(raw):
    """Match admin `portalDisplayProgrammeFromSheet` (Session Feedback / roster aliases)."""
    t = (raw or "").strip()
    if not t:
        return "—"
    t = re.sub(r"\bPhysical\s+Actuvity\b", "Physical Activity", t, flags=re.I)
    p = " ".join(t.lower().split())
    if re.search(r"\bfitfun\b", p):
        return "Bespoke Programme"
    if re.search(r"\bbespoke\b", p):
        return "Bespoke Programme"
    if (
        re.search(r"multi[\s_-]*activity", t, re.I)
        or re.search(r"splash[\s&+]+connect|splash\s+and\s+connect", t, re.I)
        or "multi activity" in p.replace("_", " ")
        or ("splash" in p and "connect" in p)
    ):
        return "MULTI-ACTIVITY"
    if re.search(r"\bfitness\b", p) or re.search(r"fitness[\s_-]*sessions?", p, re.I):
        return "Physical Activity"
    if (
        re.search(r"\bclimbing\s+activity\b", p)
        or re.search(r"\bclimb(ing)?\b", p)
        or re.search(r"climb(ing)?[\s_-]*session", p, re.I)
    ):
        return "Climbing Activity"
    if (
        re.search(r"\baquatic\s+activity\b", p)
        or re.search(r"\bswimming\b", p)
        or re.search(r"\bswim\b", p)
        or "aquatic" in p
        or re.search(r"\bpool\b", p)
        or "in-water" in p
        or "in water" in p
    ):
        return "Aquatic Activity"
    if "physical activity" in p:
        return "Physical Activity"
    if "day centre" in p or "daycentre" in p or re.search(r"\bdc\b", p):
        return "Day centre"
    if "outreach" in p or "school" in p:
        return "Outreach"
    if "ot" in p or "therapy" in p or "mdt" in p:
        return "Therapy / MDT"
    return t if len(t) <= 56 else t[:53] + "\u2026"


def main():
    import openpyxl

    if not XLSX.is_file():
        raise SystemExit(f"Missing workbook: {XLSX}")

    wb = openpyxl.load_workbook(str(XLSX), read_only=True, data_only=True)
    ws = wb.active
    rows_out = []
    for _i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        if not row or not any(x is not None and str(x).strip() for x in row[:4]):
            continue
        vals = list(row)
        while len(vals) < 11:
            vals.append(None)
        d_iso = cell_date(vals[0])
        name = norm_str(vals[1])
        instructor = norm_str(vals[2])
        service_raw = norm_str(vals[3])
        service = canonical_portal_service(service_raw) if service_raw else "—"
        if not name or not d_iso:
            continue
        if d_iso < PORTAL_SESSION_FEEDBACK_FIRST_DATE_ISO:
            continue
        rows_out.append(
            {
                "clientName": name,
                "date": d_iso,
                "service": service or "—",
                "attendance": attendance_out(vals[4]),
                "engagement": engagement_out(vals[5]),
                "emotions": norm_str(vals[6]),
                "positive": norm_str(vals[8]),
                "relevantParent": norm_str(vals[9]),
                "incidentsNotes": norm_str(vals[10]),
                "instructor": instructor,
                "independence": norm_str(vals[7]),
            }
        )

    rows_out.sort(key=lambda r: (r["date"], r["clientName"] or ""), reverse=True)
    meta = {
        "sourceFile": str(XLSX.relative_to(ROOT)).replace("\\", "/"),
        "sheet": ws.title,
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "rowCount": len(rows_out),
        "coverageFromIso": PORTAL_SESSION_FEEDBACK_FIRST_DATE_ISO,
        "sourceNote": "v1SessionFeedback only; not SessionFeedback (PORTAL).xlsx",
    }
    payload = {"meta": meta, "rows": rows_out}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        f.write("window.SESSION_FEEDBACK_PORTAL_SOURCE = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("Wrote", OUT, "rows=", len(rows_out), "bytes=", OUT.stat().st_size)


if __name__ == "__main__":
    main()
