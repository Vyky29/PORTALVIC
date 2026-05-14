# -*- coding: utf-8 -*-
"""Read working_ui/Old Participants (PORTAL).xlsx → working_ui/ELEMENTOR/MEDIOS/old_participants_portal_data.js.

The active sheet uses **named ClassForKids-style headers** (e.g. childFirstName, parentLastName).
This differs from Participants_Parents export layout: there is typically **no inClass** column;
old-archive rows default inClass to \"No\".
"""
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "working_ui" / "Old Participants (PORTAL).xlsx"
OUT = ROOT / "working_ui" / "ELEMENTOR" / "MEDIOS" / "old_participants_portal_data.js"


def norm_str(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def norm_header_key(h):
    if h is None:
        return ""
    s = str(h).strip().lower()
    s = re.sub(r"[\s_\-]+", "", s)
    return s


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


def row_dict(headers, vals):
    d = {}
    for i, h in enumerate(headers):
        k = norm_header_key(h)
        if not k:
            continue
        d[k] = vals[i] if i < len(vals) else None
    return d


def portal_row_from_header_dict(d):
    child_first = norm_str(d.get("childfirstname"))
    child_last = norm_str(d.get("childlastname"))
    if not child_first and not child_last:
        return None
    child_display = " ".join(x for x in (child_first or "", child_last or "") if x).strip()
    if not child_display:
        return None

    p1 = norm_str(d.get("parentfirstname")) or ""
    p2 = norm_str(d.get("parentlastname")) or ""
    parent_display = " ".join(x for x in (p1, p2) if x).strip() or "—"

    d_dob = to_date(d.get("dob"))
    d_created = to_date(d.get("created"))
    d_first = to_date(d.get("firstbookingdate"))
    d_last = to_date(d.get("lastbookingdate"))
    d_nextb = to_date(d.get("nextbirthday"))

    wait_raw = d.get("onwaitinglist")
    if isinstance(wait_raw, str):
        on_wait = wait_raw.strip().lower() in ("yes", "y", "true", "1")
    else:
        on_wait = bool(wait_raw) if wait_raw not in (None, "") else None

    in_raw = d.get("inclass")
    in_class = norm_str(in_raw) if in_raw not in (None, "") else "No"

    return {
        "childDisplay": child_display,
        "childFirstName": child_first or "",
        "childLastName": child_last or "",
        "contactId": fmt_id(d.get("contactid")),
        "parentFirstName": p1,
        "parentLastName": p2,
        "parentDisplay": parent_display,
        "parentPersonId": fmt_id(d.get("parentpersonid")),
        "addressLine1": norm_str(d.get("addressline1")) or "—",
        "addressLine2": norm_str(d.get("addressline2")),
        "city": norm_str(d.get("city")) or "—",
        "postcode": norm_str(d.get("postcode")) or "—",
        "mobile": fmt_mobile(d.get("mobile")) or "—",
        "username": norm_str(d.get("username")) or "—",
        "gender": norm_str(d.get("gender")) or "—",
        "inClass": in_class,
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


def main():
    import openpyxl

    wb = openpyxl.load_workbook(str(XLSX), read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        header_row = ()
    headers = [h for h in header_row]
    rows_out = []
    for row in rows_iter:
        vals = list(row)
        while len(vals) < len(headers):
            vals.append(None)
        d = row_dict(headers, vals)
        rec = portal_row_from_header_dict(d)
        if rec:
            rows_out.append(rec)

    meta = {
        "sourceFile": "Old Participants (PORTAL).xlsx",
        "sheet": ws.title,
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "rowCount": len(rows_out),
        "note": "Former clients — ClassForKids-style named columns on row 1. "
        "Regenerate: python database/export_old_participants_portal_js.py",
    }
    payload = {"meta": meta, "rows": rows_out}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        f.write("window.OLD_PARTICIPANTS_PORTAL_SOURCE = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("Wrote", OUT, "rows=", len(rows_out), "bytes=", OUT.stat().st_size)


if __name__ == "__main__":
    main()
