#!/usr/bin/env bash
# BrightVision Test Lab — invoke from repo root: ./scripts/lab.sh
# Resolves paths from this file's location (scripts/), then runs in repo root.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ROOT"

# shellcheck source=activate.sh
source "${ROOT}/activate.sh"
pip install -e .

PORT="${BV_TEST_ORCHESTRATOR_PORT:-8750}"
if command -v lsof >/dev/null 2>&1; then
  # shellcheck disable=SC2046
  lsof -ti "tcp:${PORT}" 2>/dev/null | xargs kill -9 2>/dev/null || true
fi

export BV_ROOT="$ROOT"
export BV_TEST_ORCHESTRATOR_PORT="$PORT"
exec yarn test-lab:dev "$@"
