# -*- coding: utf-8 -*-
"""Read working_ui/Clients Payments (PORTAL).xlsx and emit working_ui/ELEMENTOR/MEDIOS/clients_payments_portal_data.js"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "working_ui" / "Clients Payments (PORTAL).xlsx"
OUT = ROOT / "working_ui" / "ELEMENTOR" / "MEDIOS" / "clients_payments_portal_data.js"


def norm_str(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def parse_float(v):
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    s = str(v).strip().replace(",", "")
    if not s or s in ("—", "-", "#REF!"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def join_services(vals, d0, d1):
    parts = []
    for x in vals[d0 : d1 + 1]:
        n = norm_str(x)
        if n and n not in ("—", "-", "#REF!"):
            parts.append(n)
    return " · ".join(parts) if parts else "—"


def funding_chip(method):
    m = (method or "").lower()
    if "go card" in m or "gocardless" in m:
        return "GoCardless"
    if "bank transfer" in m:
        return "Bank transfer"
    if "own way" in m or m.strip() == "ow (behind)" or m.startswith("ow "):
        return "Own way"
    return (method or "—")[:48]


def period_note(vals):
    labels = ["Mar/Apr", "May", "June", "July"]
    bits = []
    for i, lab in enumerate(labels):
        idx = 10 + i
        v = norm_str(vals[idx] if len(vals) > idx else None)
        if v and v not in ("—", "-"):
            bits.append(f"{lab}: {v}")
    return " · ".join(bits) if bits else "—"


def main():
    import openpyxl

    wb = openpyxl.load_workbook(str(XLSX), read_only=True, data_only=True)
    ws = wb.active
    rows_out = []
    for row in ws.iter_rows(min_row=2, max_col=14, values_only=True):
        vals = list(row)
        while len(vals) < 14:
            vals.append(None)
        pax = norm_str(vals[0])
        if not pax:
            continue
        parent = norm_str(vals[1]) or "—"
        pay = norm_str(vals[2]) or "—"
        service = join_services(vals, 3, 6)
        tot = parse_float(vals[7])
        vat = norm_str(vals[8]) or "—"
        inv = norm_str(vals[9]) or "—"
        note = period_note(vals)
        rows_out.append(
            {
                "pax": pax,
                "parent": parent,
                "payMethod": pay,
                "service": service,
                "costLabel": None,
                "sessionsLabel": None,
                "tot": tot,
                "vat": vat,
                "inv": inv,
                "st": "Sheet",
                "rec": "—",
                "paid": None,
                "out": None,
                "fund": funding_chip(pay),
                "next": "—",
                "periodNote": note,
                "cfkSync": "Sheet source",
            }
        )

    meta = {
        "sourceFile": "Clients Payments (PORTAL).xlsx",
        "sheet": ws.title,
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "rowCount": len(rows_out),
    }
    payload = {"meta": meta, "rows": rows_out}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        f.write("window.CLIENTS_PAYMENTS_PORTAL_SOURCE = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("Wrote", OUT, "rows=", len(rows_out), "bytes=", OUT.stat().st_size)


if __name__ == "__main__":
    main()
