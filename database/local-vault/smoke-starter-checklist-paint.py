#!/usr/bin/env python3
"""Smoke-test HMRC starter checklist PDF paint alignment.

Mirrors working_ui/starter_checklist.html COORDS (pdf-lib bottom-left).
Renders crops under /tmp/starter_smoke/ and exits non-zero on failed checks.

Usage:
  python3 database/local-vault/smoke-starter-checklist-paint.py
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "working_ui/portal/Starter-checklist_English_2021_2022.pdf"
OUT = Path("/tmp/starter_smoke")
H = 841.89

# Keep in sync with working_ui/starter_checklist.html COORDS
COORDS = {
    "lastName": (66, H - 321.5),
    "firstNames": (66, H - 396),
    "addr1": (334, H - 321.5),
    "addr2": (334, H - 338.5),
    "addr3": (334, H - 355.5),
    "postcode": (334, H - 370),
    "country": (334, H - 387),
    "niNumber": {
        "y": H - 438.5,
        "xs": [334.3, 349.9, 372.6, 388.1, 410.8, 426.4, 449.1, 464.7, 487.4],
    },
    "empStart": {
        "y": H - 489,
        "xs": [334.5, 350.1, 372.8, 388.3, 411.0, 426.6, 442.2, 457.8],
    },
    "dob": {
        "y": H - 513,
        "xs": [66.6, 82.2, 104.9, 120.5, 143.1, 158.7, 174.3, 189.9],
    },
    "maleTick": (93.5, 380),
    "statementA": (180.5, 50),
    "ifYes": (256.8, 571),
    "declFullName": (312, H - 579.5),
    "declDate": {
        "y": H - 627.5,
        "xs": [311.1, 326.7, 349.3, 364.9, 387.6, 403.2, 418.8, 434.4],
    },
}

NI_BOX_X0 = [330.5, 346.1, 368.8, 384.3, 407.0, 422.6, 445.3, 460.9, 483.6]
EMP_BOX_X0 = [330.5, 346.1, 368.8, 384.3, 407.0, 422.6, 438.2, 453.8]
DOB_BOX_X0 = [62.6, 78.2, 100.9, 116.5, 139.1, 154.7, 170.3, 185.9]
DECL_DATE_X0 = [307.1, 322.7, 345.3, 360.9, 383.6, 399.2, 414.8, 430.4]


def draw_text(page, x, pdf_y, text, size=11, color=(0.05, 0.13, 0.30)):
    page.insert_text((x, H - pdf_y), text, fontsize=size, fontname="helv", color=color)


def draw_tick(page, x, pdf_y):
    draw_text(page, x, pdf_y, "X", size=10)


def draw_boxed(page, cfg, text, size=11):
    for i, ch in enumerate(text[: len(cfg["xs"])]):
        draw_text(page, cfg["xs"][i], cfg["y"], ch, size=size)


def draw_date(page, cfg, iso):
    d = datetime.strptime(iso, "%Y-%m-%d")
    draw_boxed(page, cfg, f"{d.day:02d}{d.month:02d}{d.year}")


def main() -> int:
    if not PDF.is_file():
        print("missing PDF", PDF, file=sys.stderr)
        return 2
    OUT.mkdir(exist_ok=True)
    doc = fitz.open(PDF)
    p0, p1 = doc[0], doc[1]

    # Remove printed Postcode (right) / Country (left) labels, same as clearLabel in HTML
    for term in ("Postcode", "Country"):
        for r in p0.search_for(term):
            # Only the address-block labels (not other pages/sections)
            if 360 < r.y0 < 400:
                p0.add_redact_annot(r, fill=(1, 1, 1))
    p0.apply_redactions()

    draw_text(p0, *COORDS["lastName"], "SMITHSON-WILLIAMS")
    draw_text(p0, *COORDS["firstNames"], "ALEXANDER JAMES")
    draw_text(p0, *COORDS["addr1"], "Flat 12, Riverside Court")
    draw_text(p0, *COORDS["addr2"], "184 High Street")
    draw_text(p0, *COORDS["addr3"], "Ealing")
    draw_text(p0, *COORDS["postcode"], "W5 2AB")
    draw_text(p0, *COORDS["country"], "United Kingdom")
    draw_boxed(p0, COORDS["niNumber"], "AB123456C")
    draw_date(p0, COORDS["empStart"], "2026-09-07")
    draw_date(p0, COORDS["dob"], "1990-03-15")
    draw_tick(p0, *COORDS["maleTick"])
    draw_tick(p0, *COORDS["statementA"])
    draw_tick(p1, *COORDS["ifYes"])
    draw_text(p1, *COORDS["declFullName"], "Alexander James Smithson-Williams", size=10)
    draw_date(p1, COORDS["declDate"], "2026-09-19")

    doc.save(OUT / "fixed_paint.pdf")

    def clip(page, r, name, z=2.8):
        pix = page.get_pixmap(matrix=fitz.Matrix(z, z), clip=fitz.Rect(*r))
        pix.save(str(OUT / name))

    clip(p0, (50, 285, 560, 420), "fix_name_addr.png")
    clip(p0, (300, 410, 560, 520), "fix_ni_emp.png")
    clip(p0, (50, 430, 220, 530), "fix_gender_dob.png")
    clip(p0, (150, 760, 540, 820), "fix_statements.png")
    clip(p1, (40, 210, 290, 450), "fix_loans.png")
    clip(p1, (40, 520, 560, 660), "fix_decl.png")

    checks = []
    checks.append(("lastName_above_line", (H - COORDS["lastName"][1]) < 325.0))
    checks.append(("firstNames_above_midline", (H - COORDS["firstNames"][1]) < 400.0))
    checks.append(
        (
            "postcode_below_addr3",
            (H - COORDS["postcode"][1]) > (H - COORDS["addr3"][1]) + 10,
        )
    )
    for i, x in enumerate(COORDS["niNumber"]["xs"]):
        checks.append((f"ni_{i}_in_box", NI_BOX_X0[i] + 1 < x < NI_BOX_X0[i] + 12))
    for i, x in enumerate(COORDS["empStart"]["xs"]):
        checks.append((f"emp_{i}_in_box", EMP_BOX_X0[i] + 1 < x < EMP_BOX_X0[i] + 12))
    for i, x in enumerate(COORDS["dob"]["xs"]):
        checks.append((f"dob_{i}_in_box", DOB_BOX_X0[i] + 1 < x < DOB_BOX_X0[i] + 12))
    for i, x in enumerate(COORDS["declDate"]["xs"]):
        checks.append((f"declDate_{i}_in_box", DECL_DATE_X0[i] + 1 < x < DECL_DATE_X0[i] + 12))

    failed = [name for name, ok in checks if not ok]
    print(f"checks={len(checks)} fail={len(failed)} crops={OUT}")
    for name in failed:
        print("FAIL", name)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
