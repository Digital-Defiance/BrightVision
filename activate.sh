#!/usr/bin/env sh
# Dev: editable Cecli (submodule) + bright_vision_core (parent package).
# Safe to source: does not enable set -e in your interactive shell.
# When .venv is warm (cecli + bright_vision_core + uvicorn importable), skips pip installs
# — speeds up yarn lab / yarn vision. Launchers set BRIGHT_VISION_ACTIVATE_QUIET=1 for
# instant re-activate when .venv exists; interactive `source activate.sh` runs import check.
# Force reinstall: BRIGHT_VISION_ACTIVATE_FORCE=1
# When sourced: zsh/BSH use %x; bash uses BASH_SOURCE; lab.sh sets BRIGHT_VISION_ROOT / BV_ROOT.
# BSH (https://bsh.digitaldefiance.org) is a zsh fork — exposes BSH_VERSION, not ZSH_VERSION.
_is_zsh_family() {
  [ -n "${ZSH_VERSION:-}" ] || [ -n "${BSH_VERSION:-}" ]
}

_canonical_dir() {
  _d="$1"
  [ -n "$_d" ] && [ -d "$_d" ] || return 1
  (cd "$_d" && pwd -P)
}

_repo_root_from_dir() {
  _dir="$1"
  _canon="$(_canonical_dir "$_dir" 2>/dev/null)" || _canon=""
  if [ -n "$_canon" ]; then
    echo "$_canon"
  else
    cd "$_dir" && pwd -P
  fi
}

_resolve_repo_root() {
  _from_script=""
  # Prefer the directory that contains this activate.sh (where the user sourced from).
  if _is_zsh_family; then
    _zsh_src="${(%):-%x}"
    case "$_zsh_src" in
      bsh | zsh | bash | sh | ksh | dash | "" | -bsh | -zsh | -bash) _zsh_src="" ;;
    esac
    if [ -z "$_zsh_src" ] && [ -n "${funcfiletrace[1]:-}" ]; then
      _zsh_src="${funcfiletrace[1]%%:*}"
    fi
    if [ -n "$_zsh_src" ]; then
      _zsh_dir="$(cd "$(dirname "$_zsh_src")" 2>/dev/null && pwd)" || _zsh_dir=""
      if [ -n "$_zsh_dir" ] && [ -d "${_zsh_dir}/bright_vision_core" ]; then
        _from_script="$_zsh_dir"
      fi
    fi
  fi
  if [ -z "$_from_script" ] && [ -n "${BASH_SOURCE[0]:-}" ]; then
    _bash_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || _bash_dir=""
    if [ -n "$_bash_dir" ] && [ -d "${_bash_dir}/bright_vision_core" ]; then
      _from_script="$_bash_dir"
    fi
  fi
  if [ -n "$_from_script" ]; then
    _repo_root_from_dir "$_from_script"
    return 0
  fi
  if [ -n "${BRIGHT_VISION_ROOT:-}" ] && [ -d "${BRIGHT_VISION_ROOT}/bright_vision_core" ]; then
    _repo_root_from_dir "${BRIGHT_VISION_ROOT}"
    return 0
  fi
  if [ -n "${BV_ROOT:-}" ] && [ -d "${BV_ROOT}/bright_vision_core" ]; then
    _repo_root_from_dir "${BV_ROOT}"
    return 0
  fi
  case "$0" in
    */activate.sh | ./activate.sh | activate.sh)
      _repo_root_from_dir "$(dirname "$0")"
      return 0
      ;;
  esac
  # sh/dash: executed as ./activate.sh (not sourced).
  # Already in repo root (common when: cd BrightVision && source ./activate.sh).
  if [ -d "./bright_vision_core" ] && [ -f "./pyproject.toml" ]; then
    _repo_root_from_dir "."
    return 0
  fi
  return 1
}
ROOT="$(_resolve_repo_root)" || {
  echo "activate.sh: cd to the BrightVision repo root and run: source ./activate.sh" >&2
  echo "  (BSH/zsh/bash; or export BRIGHT_VISION_ROOT=/path/to/BrightVision)" >&2
  return 1 2>/dev/null || exit 1
}
_prev_root="${BRIGHT_VISION_ROOT:-}"
export BRIGHT_VISION_ROOT="$ROOT"
export BV_ROOT="$ROOT"
if [ -n "$_prev_root" ] && [ "$_prev_root" != "$ROOT" ]; then
  _prev_canon="$(_canonical_dir "$_prev_root" 2>/dev/null || printf '%s' "$_prev_root")"
  if [ "$_prev_canon" != "$ROOT" ]; then
    echo "activate.sh: using ${ROOT} (activate.sh location; was BRIGHT_VISION_ROOT=${_prev_root})" >&2
  fi
fi
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

# Git tags use *-brightN; setuptools_scm needs PEP 440 (e.g. 0.2.1.post1).
bright_vision_scm_pretend_version() {
  _scm="${BRIGHT_VISION_SCM_VERSION:-}"
  if [ -z "$_scm" ] && [ -f "${ROOT}/package.json" ]; then
    _scm=$(grep '"version"' "${ROOT}/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    case "$_scm" in
      *-bright*) _scm=$(printf '%s' "$_scm" | sed 's/-bright/.post/') ;;
    esac
  fi
  printf '%s' "$_scm"
}

install_bright_vision_editable() {
  _extras="${1:-[dev]}"
  _scm="$(bright_vision_scm_pretend_version)"
  if [ -n "$_scm" ]; then
    export SETUPTOOLS_SCM_PRETEND_VERSION="$_scm"
  fi
  if ! "${PYTHON}" -m pip install -q -e "${ROOT}${_extras}"; then
    unset SETUPTOOLS_SCM_PRETEND_VERSION 2>/dev/null || true
    die "editable install failed: bright_vision_core (parent)"
    return 1
  fi
  unset SETUPTOOLS_SCM_PRETEND_VERSION 2>/dev/null || true
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
  _ve_canon="$(_canonical_dir "$_ve" 2>/dev/null || printf '%s' "$_ve")"
  _want_canon="$(_canonical_dir "${ROOT}/.venv" 2>/dev/null || printf '%s' "${ROOT}/.venv")"
  [ "$_ve_canon" != "$_want_canon" ] && return 0
  return 1
}

recreate_venv_if_needed() {
  if ! venv_needs_recreate && [ -x "${VENV}/bin/python3" ]; then
    return 0
  fi
  if [ -d "$VENV" ]; then
    echo "activate.sh: recreating stale or incomplete .venv (was: ${VENV})" >&2
    chmod -R u+w "$VENV" 2>/dev/null || true
    rm -rf "$VENV" 2>/dev/null || true
    if [ -d "$VENV" ]; then
      die "failed to remove stale .venv at ${VENV} (close apps using it, then: rm -rf ${VENV})"
    fi
  fi
}

activation_force() {
  [ "${BRIGHT_VISION_ACTIVATE_FORCE:-}" = "1" ]
}

# Fast path for yarn lab / yarn vision: skip pip when .venv already has editable installs.
activation_ready() {
  venv_needs_recreate && return 1
  _imports='import cecli, bright_vision_core, uvicorn'
  if [ "${BRIGHT_VISION_CORE_INSTALL:-editable}" = "pypi" ]; then
    _imports='import cecli, bright_vision_core, uvicorn, pytest'
  fi
  "${VENV}/bin/python3" -c "
import os, sys
if not os.path.isfile(os.path.join(sys.prefix, 'pyvenv.cfg')):
    raise SystemExit(1)
${_imports}
" 2>/dev/null
}

apply_activation_env() {
  [ -f "${VENV}/bin/activate" ] && [ -x "${VENV}/bin/python3" ] || \
    die "broken .venv at ${VENV} — rm -rf ${VENV} and re-run: source activate.sh"
  PYTHON="${VENV}/bin/python3"
  if [ ! -e "${VENV}/bin/python" ]; then
    ln -sf python3 "${VENV}/bin/python" 2>/dev/null || true
  fi
  export PATH="${VENV}/bin:${PATH}"
  export PYTHONSAFEPATH=1
  # shellcheck disable=SC1090
  . "${VENV}/bin/activate" || die "failed to activate .venv"
  export PATH="${VENV}/bin:${PATH}"
}

# Parent shell already ran activate — skip import checks + pip.
_venv_paths_match() {
  _a="$1"
  _b="$2"
  [ -n "$_a" ] && [ -n "$_b" ] || return 1
  _ac="$(_canonical_dir "$_a" 2>/dev/null || printf '%s' "$_a")"
  _bc="$(_canonical_dir "$_b" 2>/dev/null || printf '%s' "$_b")"
  [ "$_ac" = "$_bc" ]
}

activation_inherited() {
  activation_force && return 1
  [ -x "${VENV}/bin/python3" ] && [ -f "${VENV}/bin/activate" ] || return 1
  if [ -n "${BRIGHT_VISION_ACTIVATED:-}" ]; then
    _act_canon="$(_canonical_dir "$BRIGHT_VISION_ACTIVATED" 2>/dev/null || printf '%s' "$BRIGHT_VISION_ACTIVATED")"
    [ "$_act_canon" = "$ROOT" ] && return 0
  fi
  if [ -n "${VIRTUAL_ENV:-}" ]; then
    _venv_paths_match "${VIRTUAL_ENV}" "${VENV}" && return 0
  fi
  return 1
}

# yarn lab / yarn vision: trust a structurally valid .venv (skip cecli import probe).
activation_trusted_launcher() {
  [ "${BRIGHT_VISION_ACTIVATE_QUIET:-}" = "1" ] || return 1
  activation_force && return 1
  venv_needs_recreate && return 1
  [ -x "${VENV}/bin/python3" ] && [ -f "${VENV}/bin/activate" ] || return 1
  return 0
}

inherit_activation_env() {
  PYTHON="${VENV}/bin/python3"
  export BRIGHT_VISION_ROOT="$ROOT"
  export BV_ROOT="$ROOT"
  export PYTHONSAFEPATH=1
  export BRIGHT_VISION_ACTIVATED="$ROOT"
  case ":${PATH}:" in
    *":${VENV}/bin:"*) ;;
    *) export PATH="${VENV}/bin:${PATH}" ;;
  esac
  _ve_canon="$(_canonical_dir "${VIRTUAL_ENV:-}" 2>/dev/null || printf '%s' "${VIRTUAL_ENV:-}")"
  _want_canon="$(_canonical_dir "${VENV}" 2>/dev/null || printf '%s' "${VENV}")"
  if [ "$_ve_canon" != "$_want_canon" ]; then
    # shellcheck disable=SC1090
    . "${VENV}/bin/activate" || die "failed to activate .venv"
    export PATH="${VENV}/bin:${PATH}"
  fi
}

mark_activation_done() {
  export BRIGHT_VISION_ACTIVATED="$ROOT"
}

print_activation_summary() {
  _skipped="${1:-}"
  CECLI_ROOT="$(pick_cecli_root 2>/dev/null || true)"
  if [ -n "$_skipped" ]; then
    echo "Activated (cached): $("$PYTHON" -c 'import sys; print(sys.executable)')"
    echo "  skipped pip — set BRIGHT_VISION_ACTIVATE_FORCE=1 to reinstall"
  else
    echo "Activated: $("$PYTHON" -c 'import sys; print(sys.executable)')"
  fi
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
  if [ -z "$_skipped" ]; then
    echo ""
    echo "Next:"
    echo "  yarn tauri dev"
    echo "  bright-vision-core-serve       # HTTP :8741"
    echo "  python scripts/vision_serve.py # same (Tauri uses repo-root scripts/)"
  fi
}

if activation_inherited; then
  inherit_activation_env
  return 0 2>/dev/null || exit 0
fi

if activation_trusted_launcher; then
  inherit_activation_env
  mark_activation_done
  return 0 2>/dev/null || exit 0
fi

if activation_ready && ! activation_force; then
  apply_activation_env
  mark_activation_done
  if [ "${BRIGHT_VISION_ACTIVATE_QUIET:-}" != "1" ]; then
    print_activation_summary skipped
  fi
  return 0 2>/dev/null || exit 0
fi

recreate_venv_if_needed
PY_BOOT="$(pick_python)" || die "need Python 3.10+ (install python@3.12 or set BRIGHT_VISION_PYTHON)"

if [ ! -x "${VENV}/bin/python3" ]; then
  "$PY_BOOT" -m venv "$VENV" || die "failed to create .venv at ${VENV}"
fi

apply_activation_env

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

  if [ -f "${ROOT}/brightdate-python/pyproject.toml" ]; then
    if ! "$PYTHON" -m pip install -q -e "${ROOT}/brightdate-python"; then
      die "editable install failed: brightdate at ${ROOT}/brightdate-python (git submodule update --init brightdate-python)"
      return 1
    fi
  else
    echo "activate.sh: warning: brightdate-python missing — run: git submodule update --init brightdate-python" >&2
  fi

  if [ ! -f "${ROOT}/pyproject.toml" ]; then
    die "missing ${ROOT}/pyproject.toml (bright_vision_core package)"
    return 1
  fi
  install_bright_vision_editable "[dev]"
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
mark_activation_done
print_activation_summary
