#!/usr/bin/env bash
# Thin wrapper — source of truth is bright_vision_core.test_suite (CLI + Test Lab).
# GPU timing: prefers bcpucap (legacy gpucap alias). History: .bright-vision/test-everything-timing.json
# Usage: source activate.sh && yarn test:everything
#   --logged   Full transcript under .bright-vision/test-suite-runs/ (or TEST_EVERYTHING_LOG)
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export BV_ROOT="$ROOT"

if [ -x .venv/bin/python3 ]; then
  exec .venv/bin/python3 -m bright_vision_core.test_suite.cli "$@"
fi
echo "error: .venv/bin/python3 not found — run: source activate.sh" >&2
exit 1
