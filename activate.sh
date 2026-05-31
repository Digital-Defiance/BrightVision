#!/usr/bin/env sh
# Dev: editable Cecli (submodule) + bright_vision_core (parent package).
# Safe to source: does not enable set -e in your interactive shell.
# When sourced from scripts/lab.sh, $0 is lab.sh — use BRIGHT_VISION_ROOT / BV_ROOT / BASH_SOURCE.
_resolve_repo_root() {
  if [ -n "${BRIGHT_VISION_ROOT:-}" ] && [ -d "${BRIGHT_VISION_ROOT}/bright_vision_core" ]; then
    cd "${BRIGHT_VISION_ROOT}" && pwd
    return 0
  fi
  if [ -n "${BV_ROOT:-}" ] && [ -d "${BV_ROOT}/bright_vision_core" ]; then
    cd "${BV_ROOT}" && pwd
    return 0
  fi
  if [ -n "${BASH_VERSION:-}" ] && [ -n "${BASH_SOURCE[0]:-}" ]; then
    cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
    return 0
  fi
  case "$0" in
    */activate.sh | ./activate.sh | activate.sh)
      cd "$(dirname "$0")" && pwd
      return 0
      ;;
  esac
  return 1
}
ROOT="$(_resolve_repo_root)" || {
  echo "activate.sh: set BRIGHT_VISION_ROOT to the repo root, or run: source ./activate.sh from that directory" >&2
  return 1 2>/dev/null || exit 1
}
VENV="${ROOT}/.venv"

die() {
  echo "activate.sh: $*" >&2
  return 1 2>/dev/null || exit 1
}

# Where the cecli Python package is installed from (submodule or legacy bundle).
resolve_cecli_root() {
  _engine="${1:-}"
  case "$_engine" in
    cecli|./cecli) echo "${ROOT}/cecli" ;;
    bright-vision-core|BrightVision-core)
      if [ -d "${ROOT}/cecli" ]; then echo "${ROOT}/cecli"; else echo "${ROOT}/BrightVision-core"; fi
      ;;
    "") ;;
    *) echo "${ROOT}/${_engine}" ;;
  esac
}

# Prefer Homebrew/pyenv 3.10+ over macOS /usr/bin python3 (often 3.9).
pick_python() {
  if [ -n "${BRIGHT_VISION_PYTHON:-}" ] && [ -x "${BRIGHT_VISION_PYTHON}" ]; then
    echo "${BRIGHT_VISION_PYTHON}"
    return 0
  fi
  for cmd in python3.14 python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$cmd" >/dev/null 2>&1; then
      if "$cmd" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
        command -v "$cmd"
        return 0
      fi
    fi
  done
  return 1
}

pick_cecli_root() {
  _explicit="$(resolve_cecli_root "${BRIGHT_VISION_CECLI_DIR:-}")"
  if [ -n "$_explicit" ] && [ -d "$_explicit" ]; then
    echo "$_explicit"
    return 0
  fi
  if [ -d "${ROOT}/cecli/cecli" ] || [ -f "${ROOT}/cecli/pyproject.toml" ]; then
    echo "${ROOT}/cecli"
    return 0
  fi
  if [ -d "${ROOT}/BrightVision-core/cecli" ]; then
    echo "${ROOT}/BrightVision-core"
    return 0
  fi
  return 1
}

venv_needs_recreate() {
  [ ! -x "${VENV}/bin/python3" ] && return 0
  if ! "${VENV}/bin/python3" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    return 0
  fi
  _cfg="${VENV}/bin/activate"
  [ ! -f "$_cfg" ] && return 0
  _ve=$(
    grep '^VIRTUAL_ENV=' "$_cfg" 2>/dev/null | head -1 | sed 's/^VIRTUAL_ENV=//;s/^"//;s/"$//'
  )
  [ "$_ve" != "${ROOT}/.venv" ] && return 0
  return 1
}

if venv_needs_recreate; then
  if [ -d "$VENV" ]; then
    echo "activate.sh: recreating stale .venv (was: ${VENV})" >&2
    rm -rf "$VENV"
  fi
fi
PY_BOOT="$(pick_python)" || die "need Python 3.10+ (install python@3.12 or set BRIGHT_VISION_PYTHON)"

if [ ! -d "$VENV" ]; then
  "$PY_BOOT" -m venv "$VENV" || die "failed to create .venv"
fi

PYTHON="${VENV}/bin/python3"
if [ ! -e "${VENV}/bin/python" ]; then
  ln -sf python3 "${VENV}/bin/python" 2>/dev/null || true
fi
export PATH="${VENV}/bin:${PATH}"
# Parent repo has a `cecli/` submodule dir; cwd on sys.path shadows the installed package.
export PYTHONSAFEPATH=1
# shellcheck disable=SC1090
. "${VENV}/bin/activate" || die "failed to activate .venv"
export PATH="${VENV}/bin:${PATH}"

if ! "$PYTHON" -c 'import os, sys; sys.exit(0 if os.path.isfile(os.path.join(sys.prefix, "pyvenv.cfg")) else 1)' 2>/dev/null; then
  echo "activate.sh: warning: interpreter may not be this repo venv ($("$PYTHON" -c 'import sys; print(sys.executable)'))" >&2
  echo "  Run: deactivate 2>/dev/null; source ${ROOT}/activate.sh" >&2
fi

"$PYTHON" -m pip install -q -U pip || die "pip upgrade failed"

if [ "${BRIGHT_VISION_CORE_INSTALL:-editable}" = "pypi" ] && [ -f "${ROOT}/requirements-core.txt" ]; then
  if ! "$PYTHON" -m pip install -q -r "${ROOT}/requirements-core.txt"; then
    die "PyPI install failed. Use editable: source activate.sh"
    return 1
  fi
else
  CECLI_ROOT="$(pick_cecli_root)" || die "no cecli checkout (git submodule update --init cecli or BrightVision-core)"

  if [ -f "${CECLI_ROOT}/scripts/scm_pep440.sh" ]; then
    # shellcheck disable=SC1091
    eval "$(sh "${CECLI_ROOT}/scripts/scm_pep440.sh" "${CECLI_ROOT}")"
  fi
  if ! "$PYTHON" -m pip install -q -e "${CECLI_ROOT}"; then
    die "editable install failed: cecli at ${CECLI_ROOT}"
    return 1
  fi

  if [ ! -f "${ROOT}/pyproject.toml" ]; then
    die "missing ${ROOT}/pyproject.toml (bright_vision_core package)"
    return 1
  fi
  # Parent repo git tags use *-brightN; setuptools_scm needs PEP 440 (e.g. 0.1.1.post3).
  _scm="${BRIGHT_VISION_SCM_VERSION:-}"
  if [ -z "$_scm" ] && [ -f "${ROOT}/package.json" ]; then
    _scm=$(grep '"version"' "${ROOT}/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    case "$_scm" in
      *-bright*) _scm=$(printf '%s' "$_scm" | sed 's/-bright/.post/') ;;
    esac
  fi
  if [ -n "$_scm" ]; then
    export SETUPTOOLS_SCM_PRETEND_VERSION="$_scm"
  fi
  # [dev] in same install — git tags *-brightN are not PEP 440; pretend version must stay set.
  if ! "$PYTHON" -m pip install -q -e "${ROOT}[dev]"; then
    die "editable install failed: bright_vision_core (parent)"
    return 1
  fi
  unset SETUPTOOLS_SCM_PRETEND_VERSION 2>/dev/null || true
fi

if ! "$PYTHON" -m pip install -q "uvicorn[standard]"; then
  die "uvicorn install failed"
  return 1
fi

if [ "${BRIGHT_VISION_CORE_INSTALL:-editable}" = "pypi" ]; then
  if ! "$PYTHON" -m pip install -q "pytest>=8.0" "pytest-asyncio>=0.24"; then
    die "pytest install failed (yarn test:llm:core / test:bright-core)"
    return 1
  fi
fi

CECLI_ROOT="$(pick_cecli_root 2>/dev/null || true)"
echo "Activated: $("$PYTHON" -c 'import sys; print(sys.executable)')"
echo "  Python venv:  ${VIRTUAL_ENV:-$VENV}"
echo "  Vision API:   ${ROOT}/bright_vision_core  (pip install -e ${ROOT})"
if [ -n "$CECLI_ROOT" ]; then
  if [ "$CECLI_ROOT" = "${ROOT}/cecli" ]; then
    echo "  Cecli agent:  ${CECLI_ROOT}  (submodule → Digital-Defiance/cecli)"
  elif [ "$CECLI_ROOT" = "${ROOT}/BrightVision-core" ]; then
    echo "  Cecli agent:  ${CECLI_ROOT}  (legacy bundle — prefer: git submodule update --init cecli)"
  else
    echo "  Cecli agent:  ${CECLI_ROOT}"
  fi
else
  echo "  Cecli agent:  (from PyPI / requirements-core.txt)"
fi
echo "  Serve CLI:    $(command -v bright-vision-core-serve 2>/dev/null || echo '(not on PATH)')"
echo ""
echo "Next:"
echo "  yarn tauri dev"
echo "  bright-vision-core-serve       # HTTP :8741"
echo "  python scripts/vision_serve.py # same (Tauri uses repo-root scripts/)"
