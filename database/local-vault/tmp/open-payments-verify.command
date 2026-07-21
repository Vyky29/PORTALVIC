#!/bin/bash
# Double-click to open Payments verify (local, outside portal admin).
cd "$(dirname "$0")/../../.." || exit 1
PORT=8765
if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  open "http://127.0.0.1:${PORT}/"
  exit 0
fi
exec node database/local-vault/tmp/gen-payments-verify-html.mjs --serve
