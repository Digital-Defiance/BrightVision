#!/usr/bin/env bash
# BrightVision Test Lab — GUI + orchestrator. From repo root: yarn lab  (or ./scripts/lab.sh)
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ROOT"

export BRIGHT_VISION_ROOT="$ROOT"
export BV_ROOT="$ROOT"

# shellcheck source=activate.sh
source "${ROOT}/activate.sh"

if [ ! -d "${ROOT}/node_modules/@brightvision/test-lab" ] && [ ! -L "${ROOT}/node_modules/@brightvision/test-lab" ]; then
  echo "lab: installing yarn workspaces (first run)…" >&2
  yarn install
fi

PORT="${BV_TEST_ORCHESTRATOR_PORT:-8750}"
if command -v lsof >/dev/null 2>&1; then
  # shellcheck disable=SC2046
  lsof -ti "tcp:${PORT}" 2>/dev/null | xargs kill -9 2>/dev/null || true
fi

export BV_TEST_ORCHESTRATOR_PORT="$PORT"
echo "lab: starting Test Lab window (Vite :1421, orchestrator :${PORT})…" >&2
exec yarn test-lab:dev "$@"
