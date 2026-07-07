#!/usr/bin/env bash
# Regenerate the rental reference HTML (from the authoritative 2026/27 calendar)
# and render each one to PDF via headless Chrome.
#
# Output PDF names (as used when sharing with venues):
#   pool-room-rental-schedule-2026-27.html -> "Acton&Northolt:Bokings2026-27.pdf"
#   westway-sunday-climbing-2026-27.html   -> "westway-sunday-climbing-2026-27.pdf"
#   swimfarm-rentals-2026-27.html          -> "swimfarm-rentals-2026-27.pdf"
#
# Usage: bash docs/rentals/build_rentals.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# 1) Rebuild HTML from the calendar (term dates fragment + Westway + SwimFarm).
node build_rental_dates.js
node build_rental_extra.js

# 2) Locate a headless Chrome binary.
CHROME=""
for c in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "$(command -v google-chrome 2>/dev/null || true)" \
  "$(command -v chromium 2>/dev/null || true)"; do
  if [ -n "$c" ] && [ -x "$c" ]; then CHROME="$c"; break; fi
done
if [ -z "$CHROME" ]; then
  echo "No headless Chrome found — HTML regenerated, skipped PDF render." >&2
  exit 0
fi

# 3) Render each HTML to its shareable PDF name.
render() { # <html> <pdf>
  "$CHROME" --headless --disable-gpu --no-pdf-header-footer \
    --print-to-pdf="$2" "file://$DIR/$1" 2>/dev/null && echo "OK $2"
}

render "pool-room-rental-schedule-2026-27.html" "Acton&Northolt:Bokings2026-27.pdf"
render "westway-sunday-climbing-2026-27.html"   "westway-sunday-climbing-2026-27.pdf"
render "swimfarm-rentals-2026-27.html"          "swimfarm-rentals-2026-27.pdf"
