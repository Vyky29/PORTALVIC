# -*- coding: utf-8 -*-
"""Wrap roster_term_master_seed.json as a JS global for file:// grid editor."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "working_ui" / "portal" / "roster_term_master_seed.json"
DST = ROOT / "working_ui" / "portal" / "roster_term_master_seed.boot.js"


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing {SRC}")
    text = SRC.read_text(encoding="utf-8").strip()
    DST.write_text(
        "/* Auto-generated from roster_term_master_seed.json — do not edit by hand */\n"
        f"window.PORTAL_ROSTER_TERM_MASTER_SEED = {text};\n",
        encoding="utf-8",
    )
    print(f"Wrote {DST.relative_to(ROOT)} ({DST.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
