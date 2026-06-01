#!/usr/bin/env sh
# Compress a Test Lab transcript for Cursor/agent context (heartbeats collapsed).
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="${ROOT}/.venv/bin/python3"
if [ ! -x "$PY" ]; then
  PY=python3
fi
exec "$PY" -m bright_vision_core.test_suite digest "$@"
