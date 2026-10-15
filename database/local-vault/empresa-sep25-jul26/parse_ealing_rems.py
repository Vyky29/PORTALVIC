"""Parse saved Ealing CWD Domcare remittance PDFs into per-child lines.

  python3 database/local-vault/empresa-sep25-jul26/parse_ealing_rems.py [--other]

Prints one row per child line: cycle id | file period | name | client ref | line period | weekly | amount.
--other dumps the text of the non-Domcare REMITTANCE_ PDFs (other payers) instead.
"""
import os
import re
import sys

from pypdf import PdfReader

DIR = os.path.join(os.path.dirname(__file__), "..", "private", "ealing-mail")


def text(path):
    return "\n".join((p.extract_text() or "") for p in PdfReader(path).pages)


def money(s):
    s = s.replace("£", "").replace(",", "")
    neg = s.startswith("-")
    v = float(s.lstrip("-"))
    return -v if neg else v


if "--other" in sys.argv:
    for fn in sorted(os.listdir(DIR)):
        if "REMITTANCE_" in fn and fn.endswith(".pdf"):
            print("=" * 30, fn)
            print(text(os.path.join(DIR, fn))[:2500])
    sys.exit(0)

seen = set()
for fn in sorted(os.listdir(DIR)):
    if "Domcare_Remittance" not in fn or not fn.endswith(".pdf"):
        continue
    m = re.search(r"IDx3A_(\d+)", fn)
    cyc = m.group(1) if m else "?"
    if cyc in seen:
        continue
    seen.add(cyc)
    t = text(os.path.join(DIR, fn))
    total = re.search(r"Total Remittance\s+(-?£[\d,]+\.?\d*)", t)
    blocks = re.split(r"\n(?=[A-Z][A-Za-z'\-]+, [A-Z][A-Za-z'\- ]+ \(\d+/\d+\))", t)
    rows = []
    for b in blocks:
        h = re.match(r"([A-Z][A-Za-z'\-]+, [A-Z][A-Za-z'\- ]+) \((\d+)/(\d+)\)", b)
        if not h:
            continue
        per = re.search(r"Client Ref: \d+ \(([\d/]+) - ([\d/]+)\)", b)
        nums = re.findall(r"(-?£[\d,]+\.\d{2}) £0\.00 (-?£[\d,]+\.\d{2}) (-?£[\d,]+\.\d{2})", b)
        if not nums:
            continue
        gross, _net, amt = nums[-1]
        rows.append((h.group(1), h.group(3), per.group(1) + "-" + per.group(2) if per else "?", money(gross), money(amt)))
    s = sum(r[4] for r in rows)
    print(f"## cycle {cyc} | {fn.split('IDx3A_')[1][6:30]} | total {total.group(1) if total else '?'} | sum lines {s:.2f}")
    for r in rows:
        print(f"   {r[0]:<22} {r[1]:<7} {r[2]:<23} weekly {r[3]:>9.2f} amount {r[4]:>10.2f}")
