#!/usr/bin/env bash
# Serve the editor locally. ES modules require http(s), not file://.
set -e
PORT="${1:-8080}"
echo "POC Tile Editor → http://localhost:${PORT}"
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "$PORT" .
else
  echo "Need python3 or npx to serve. Install one and retry." >&2
  exit 1
fi
