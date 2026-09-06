#!/usr/bin/env bash
# Start the API and the web UI together, and stop both on Ctrl-C.
#
# Ports are overridable because 3000 and 8000 are commonly already taken:
#   API_PORT=8010 WEB_PORT=3001 ./dev.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PORT="${API_PORT:-8010}"
WEB_PORT="${WEB_PORT:-3001}"
VENV="$ROOT/rag_pipeline/.venv"

if [ ! -x "$VENV/bin/uvicorn" ]; then
  echo "Missing virtualenv at $VENV"
  echo "Create it with:"
  echo "  python3.11 -m venv rag_pipeline/.venv"
  echo "  rag_pipeline/.venv/bin/pip install -r rag_pipeline/requirements.txt -r api/requirements.txt"
  exit 1
fi

if [ ! -d "$ROOT/web/node_modules" ]; then
  echo "Installing web dependencies..."
  (cd "$ROOT/web" && npm install)
fi

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

for port in "$API_PORT" "$WEB_PORT"; do
  if port_busy "$port"; then
    echo "Port $port is already in use. Re-run with a free port, e.g.:"
    echo "  API_PORT=8020 WEB_PORT=3005 ./dev.sh"
    exit 1
  fi
done

cleanup() {
  echo ""
  echo "Shutting down..."
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "API  → http://localhost:$API_PORT  (docs at /docs)"
echo "Web  → http://localhost:$WEB_PORT"
echo ""

(cd "$ROOT/api" && "$VENV/bin/uvicorn" main:app --port "$API_PORT" --host 127.0.0.1) &

# The browser bundle needs the API URL at build time, not run time
(cd "$ROOT/web" && NEXT_PUBLIC_API_URL="http://localhost:$API_PORT" npm run dev -- --port "$WEB_PORT") &

wait
