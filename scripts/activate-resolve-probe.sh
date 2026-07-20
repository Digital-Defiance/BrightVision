#!/usr/bin/env sh
# Repo-root detection shared by activate.sh and verify-activate-resolve.sh (keep in sync).
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
  if [ -d "./bright_vision_core" ] && [ -f "./pyproject.toml" ]; then
    _repo_root_from_dir "."
    return 0
  fi
  return 1
}
