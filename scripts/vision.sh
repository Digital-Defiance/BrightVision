#!/usr/bin/env bash
# BrightVision GUI + orchestrator. From repo root: yarn vision  (or ./scripts/vision.sh)
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ROOT"

export BRIGHT_VISION_ROOT="$ROOT"
export BV_ROOT="$ROOT"

# shellcheck source=activate.sh
source "${ROOT}/activate.sh"

PORT="${BV_CORE_PORT:-8751}"
if command -v lsof >/dev/null 2>&1; then
  # shellcheck disable=SC2046
  lsof -ti "tcp:${PORT}" 2>/dev/null | xargs kill -9 2>/dev/null || true
fi

export BV_CORE_PORT="$PORT"
echo "vision: starting BrightVision window (Vite :1420, orchestrator :${PORT})…" >&2
if [ -n "${BV_RESET_PIP:-}" ]; then
  echo "Performing pip install..."
  pip install -e cecli
  install_bright_vision_editable "[dev]"
fi
exec yarn tauri dev "$@"
