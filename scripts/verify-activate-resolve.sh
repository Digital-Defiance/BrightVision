#!/usr/bin/env sh
# Verify activate.sh repo-root detection under BSH, zsh, and bash (no pip/venv).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
. "${ROOT}/scripts/activate-resolve-probe.sh"

_fail=0
_try() {
  _label="$1"
  _cmd="$2"
  _bin="${_label%% *}"
  if ! command -v "$_bin" >/dev/null 2>&1; then
    echo "SKIP: $_label"
    return 0
  fi
  _out="$(eval "$_cmd" 2>&1)" || {
    echo "FAIL: $_label — $_out"
    _fail=1
    return 0
  }
  if [ "$_out" = "$ROOT" ]; then
    echo "PASS: $_label"
  else
    echo "FAIL: $_label expected $ROOT got $_out"
    _fail=1
  fi
}

# Probe (fast): cwd fallback when sourced from scripts/.
_try "bsh probe" "bsh -fc 'cd \"$ROOT\" && . ./scripts/activate-resolve-probe.sh && _resolve_repo_root'"
_try "zsh probe" "zsh -fc 'cd \"$ROOT\" && . ./scripts/activate-resolve-probe.sh && _resolve_repo_root'"
_try "bash probe" "bash -c 'cd \"$ROOT\" && . ./scripts/activate-resolve-probe.sh && _resolve_repo_root'"

# Real activate.sh at repo root (BSH primary).
_try "bsh activate" "bsh -fc 'cd \"$ROOT\" && source ./activate.sh >/dev/null 2>&1; echo \$BRIGHT_VISION_ROOT'"

exit "$_fail"
