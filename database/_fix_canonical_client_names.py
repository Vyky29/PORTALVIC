# -*- coding: utf-8 -*-
"""Normalize participant display names in portal feedback JS (Adaam -> Adaam Ah, etc.)."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FEEDBACK_JS = ROOT / "working_ui" / "portal" / "session_feedback_portal_data.js"

ALIASES = {
    "aadam ah": "Aydaan Ah",
    "aadam": "Aydaan Ah",
    "adaam": "Adaam Ah",
    "adaam ah": "Adaam Ah",
}


def canonical_participant_name(name: str) -> str:
    n = re.sub(r"\s+", " ", str(name or "").strip())
    if not n:
        return n
    return ALIASES.get(n.lower(), n)


def fix_feedback_js() -> int:
    text = FEEDBACK_JS.read_text(encoding="utf-8")
    m = re.search(r"window\.SESSION_FEEDBACK_PORTAL_SOURCE = (\{.*\});\s*$", text, re.S)
    if not m:
        raise SystemExit("Could not parse feedback JS")
    data = json.loads(m.group(1))
    n = 0
    for row in data.get("rows") or []:
        old = str(row.get("clientName") or "").strip()
        new = canonical_participant_name(old)
        if new != old:
            row["clientName"] = new
            n += 1
    prefix = text[: m.start(1)]
    suffix = ";\n"
    FEEDBACK_JS.write_text(
        prefix + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + suffix,
        encoding="utf-8",
    )
    return n


if __name__ == "__main__":
    print(f"Fixed {fix_feedback_js()} feedback row clientName(s) in {FEEDBACK_JS.relative_to(ROOT)}")
