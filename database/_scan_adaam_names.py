# -*- coding: utf-8 -*-
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def scan():
    issues = []
    for path in ROOT.rglob("*"):
        if path.suffix not in {".csv", ".js", ".json", ".html", ".tsv", ".txt"}:
            continue
        if "node_modules" in path.parts or ".git" in path.parts:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        if "Adaam" not in text and "adaam" not in text:
            continue
        for m in re.finditer(r"\bAdaam\b(?!\s+Ah)", text):
            issues.append((str(path.relative_to(ROOT)), m.group(0), text[max(0, m.start() - 20) : m.end() + 20]))
        for m in re.finditer(r'"client_name"\s*:\s*"Adaam"', text):
            issues.append((str(path.relative_to(ROOT)), "client_name Adaam", m.group(0)))
        for m in re.finditer(r'"name"\s*:\s*"Adaam"', text):
            issues.append((str(path.relative_to(ROOT)), "name Adaam", m.group(0)))
    return issues


if __name__ == "__main__":
    issues = scan()
    print(f"issues: {len(issues)}")
    for p, kind, ctx in issues[:40]:
        print(p, kind, repr(ctx)[:80])
