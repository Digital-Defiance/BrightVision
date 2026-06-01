#!/usr/bin/env sh
# Free Vision API on :8741 (left running after integration / test-local release).
set -u
PORT="${BV_CORE_PORT:-8741}"
if ! command -v lsof >/dev/null 2>&1; then
  exit 0
fi
PIDS=$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "free-core-port: freeing tcp:${PORT} (stale Vision API)" >&2
  # shellcheck disable=SC2086
  kill -9 $PIDS 2>/dev/null || true
  sleep 0.3
fi
