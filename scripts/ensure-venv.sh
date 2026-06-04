#!/usr/bin/env sh
# One-time (or forced) editable pip setup. Launchers source activate.sh with QUIET=1 first
# (instant PATH only), then call this when imports are missing.
# Force reinstall: BV_VISION_SETUP=1 yarn vision

_ensure_root="${BRIGHT_VISION_ROOT:-${BV_ROOT:-}}"
if [ -z "$_ensure_root" ] || [ ! -f "${_ensure_root}/activate.sh" ]; then
  echo "ensure-venv: BRIGHT_VISION_ROOT not set" >&2
  return 1 2>/dev/null || exit 1
fi

_ensure_py="${_ensure_root}/.venv/bin/python3"
_ensure_imports='import cecli, bright_vision_core, uvicorn, pytest'

_ensure_deps_ok() {
  [ -x "$_ensure_py" ] && "$_ensure_py" -c "$_ensure_imports" 2>/dev/null
}

if [ "${BV_VISION_SETUP:-}" != "1" ] && _ensure_deps_ok; then
  return 0 2>/dev/null || exit 0
fi

echo "ensure-venv: installing editable cecli + bright_vision_core (one-time pip)…" >&2
unset BRIGHT_VISION_ACTIVATE_QUIET
export BRIGHT_VISION_ACTIVATE_FORCE=1
# shellcheck source=activate.sh
if ! . "${_ensure_root}/activate.sh"; then
  echo "ensure-venv: activate.sh failed" >&2
  return 1 2>/dev/null || exit 1
fi

if ! _ensure_deps_ok; then
  echo "ensure-venv: imports still missing after pip — run manually:" >&2
  echo "  cd ${_ensure_root} && rm -rf .venv && source activate.sh" >&2
  "$_ensure_py" -c "$_ensure_imports" 2>&1 || true
  return 1 2>/dev/null || exit 1
fi
