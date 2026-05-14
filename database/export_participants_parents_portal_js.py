# -*- coding: utf-8 -*-
"""Read working_ui/Participants_Parents info (PORTAL).xlsx and emit working_ui/ELEMENTOR/MEDIOS/participants_parents_portal_data.js.

Sheet is typically a ClassForKids contacts export (CSV column names). Used for admin participant
overview (parent / address / DOB / booking dates). Registration-form Q&A can be wired separately
when that export exists.
"""
import json
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "working_ui" / "Participants_Parents info (PORTAL).xlsx"
OUT = ROOT / "working_ui" / "ELEMENTOR" / "MEDIOS" / "participants_parents_portal_data.js"


def norm_str(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def to_date(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return None


def uk_display(d):
    if d is None:
        return None
    return d.strftime("%d/%m/%Y")


def iso_date(d):
    if d is None:
        return None
    return d.isoformat()


def fmt_id(v):
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if float(v).is_integer():
            return str(int(v))
        return str(v)
    return norm_str(str(v))


def fmt_mobile(v):
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        n = float(v)
        if n.is_integer():
            s = str(int(n))
            if s.isdigit() and len(s) == 10 and not s.startswith("0"):
                return "0" + s
            return s
        return str(v)
    return norm_str(v)


def main():
    import openpyxl

    wb = openpyxl.load_workbook(str(XLSX), read_only=True, data_only=True)
    ws = wb.active
    rows_out = []
    for row in ws.iter_rows(min_row=2, max_col=20, values_only=True):
        vals = list(row)
        while len(vals) < 20:
            vals.append(None)
        child_first = norm_str(vals[2])
        child_last = norm_str(vals[4])
        if not child_first and not child_last:
            continue
        child_display = " ".join(x for x in (child_first or "", child_last or "") if x).strip()
        if not child_display:
            continue
        p1 = norm_str(vals[12]) or ""
        p2 = norm_str(vals[13]) or ""
        parent_display = " ".join(x for x in (p1, p2) if x).strip() or "—"
        d_dob = to_date(vals[7])
        d_created = to_date(vals[6])
        d_first = to_date(vals[16])
        d_last = to_date(vals[17])
        d_nextb = to_date(vals[19])
        wait_raw = vals[11]
        if isinstance(wait_raw, str):
            on_wait = wait_raw.strip().lower() in ("yes", "y", "true", "1")
        else:
            on_wait = bool(wait_raw) if wait_raw not in (None, "") else None
        rows_out.append(
            {
                "childDisplay": child_display,
                "childFirstName": child_first or "",
                "childLastName": child_last or "",
                "contactId": fmt_id(vals[3]),
                "parentFirstName": p1,
                "parentLastName": p2,
                "parentDisplay": parent_display,
                "parentPersonId": fmt_id(vals[14]),
                "addressLine1": norm_str(vals[0]) or "—",
                "addressLine2": norm_str(vals[1]),
                "city": norm_str(vals[5]) or "—",
                "postcode": norm_str(vals[15]) or "—",
                "mobile": fmt_mobile(vals[10]) or "—",
                "username": norm_str(vals[18]) or "—",
                "gender": norm_str(vals[8]) or "—",
                "inClass": norm_str(vals[9]) or "—",
                "onWaitingList": on_wait,
                "dobIso": iso_date(d_dob),
                "dobDisplay": uk_display(d_dob) or "—",
                "createdIso": iso_date(d_created),
                "createdDisplay": uk_display(d_created) or "—",
                "firstBookingIso": iso_date(d_first),
                "firstBookingDisplay": uk_display(d_first) or "—",
                "lastBookingIso": iso_date(d_last),
                "lastBookingDisplay": uk_display(d_last) or "—",
                "nextBirthdayIso": iso_date(d_nextb),
                "nextBirthdayDisplay": uk_display(d_nextb) or "—",
            }
        )

    meta = {
        "sourceFile": "Participants_Parents info (PORTAL).xlsx",
        "sheet": ws.title,
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "rowCount": len(rows_out),
        "note": "ClassForKids-style contacts export: parent, address, DOB, booking window. "
        "Intake / registration questionnaire answers can be merged when you add that second source.",
    }
    payload = {"meta": meta, "rows": rows_out}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        f.write("window.PARTICIPANTS_PARENTS_PORTAL_SOURCE = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("Wrote", OUT, "rows=", len(rows_out), "bytes=", OUT.stat().st_size)


if __name__ == "__main__":
    main()
