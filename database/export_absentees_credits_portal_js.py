# -*- coding: utf-8 -*-
"""Read working_ui/Absentees & Credits (PORTAL).xlsx and emit working_ui/ELEMENTOR/MEDIOS/absentees_credits_portal_data.js"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "working_ui" / "Absentees & Credits (PORTAL).xlsx"
OUT = ROOT / "working_ui" / "ELEMENTOR" / "MEDIOS" / "absentees_credits_portal_data.js"


def norm_str(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def excel_serial_to_date(x):
    """Return date() or None. Handles float serial or datetime."""
    if x is None:
        return None
    if isinstance(x, datetime):
        return x.date()
    if isinstance(x, (int, float)) and not isinstance(x, bool):
        try:
            n = float(x)
        except (TypeError, ValueError):
            return None
        if n <= 0:
            return None
        base = datetime(1899, 12, 30)
        d = base + timedelta(days=n)
        return d.date()
    return None


def uk_display(d):
    if d is None:
        return None
    return d.strftime("%d/%m/%Y")


def main():
    import openpyxl

    wb = openpyxl.load_workbook(str(XLSX), read_only=True, data_only=True)
    ws = wb["RefundsMake Ups"]
    rows_out = []
    for row in ws.iter_rows(min_row=2, max_col=6, values_only=True):
        vals = list(row)
        while len(vals) < 6:
            vals.append(None)
        name = norm_str(vals[0])
        if not name:
            continue
        time_missed = norm_str(vals[1]) or "—"
        raw_date = vals[2]
        d = excel_serial_to_date(raw_date)
        date_iso = d.isoformat() if d else None
        date_display = uk_display(d) if d else None
        service = norm_str(vals[3]) or "—"
        reason = norm_str(vals[4]) or "—"
        status = norm_str(vals[5]) or "—"
        rows_out.append(
            {
                "clientName": name,
                "timeMissed": time_missed,
                "dateIso": date_iso,
                "dateDisplay": date_display,
                "service": service,
                "reason": reason,
                "status": status,
            }
        )

    meta = {
        "sourceFile": "Absentees & Credits (PORTAL).xlsx",
        "sheet": ws.title,
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "rowCount": len(rows_out),
        "note": "Term-level refunds / make-ups / credits; families often call daily to update outcomes.",
    }
    payload = {"meta": meta, "rows": rows_out}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        f.write("window.ABSENTEES_CREDITS_PORTAL_SOURCE = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("Wrote", OUT, "rows=", len(rows_out), "bytes=", OUT.stat().st_size)


if __name__ == "__main__":
    main()
