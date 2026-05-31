#!/usr/bin/env sh
# Free Playwright E2E preview port (default 4173) before starting a new preview.
set -u
PORT="${E2E_PREVIEW_PORT:-4173}"
if ! command -v lsof >/dev/null 2>&1; then
  exit 0
fi
PIDS=$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "free-e2e-preview-port: freeing tcp:${PORT} (stale listener)" >&2
  # shellcheck disable=SC2086
  kill -9 $PIDS 2>/dev/null || true
  sleep 0.3
fi
