#!/usr/bin/env sh
# Repo-root detection shared by activate.sh and verify-activate-resolve.sh (keep in sync).
_is_zsh_family() {
  [ -n "${ZSH_VERSION:-}" ] || [ -n "${BSH_VERSION:-}" ]
}

_resolve_repo_root() {
  if [ -n "${BRIGHT_VISION_ROOT:-}" ] && [ -d "${BRIGHT_VISION_ROOT}/bright_vision_core" ]; then
    cd "${BRIGHT_VISION_ROOT}" && pwd
    return 0
  fi
  if [ -n "${BV_ROOT:-}" ] && [ -d "${BV_ROOT}/bright_vision_core" ]; then
    cd "${BV_ROOT}" && pwd
    return 0
  fi
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
        echo "$_zsh_dir"
        return 0
      fi
    fi
  fi
  if [ -n "${BASH_SOURCE[0]:-}" ]; then
    _bash_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || _bash_dir=""
    if [ -n "$_bash_dir" ] && [ -d "${_bash_dir}/bright_vision_core" ]; then
      echo "$_bash_dir"
      return 0
    fi
  fi
  case "$0" in
    */activate.sh | ./activate.sh | activate.sh)
      cd "$(dirname "$0")" && pwd
      return 0
      ;;
  esac
  if [ -d "./bright_vision_core" ] && [ -f "./pyproject.toml" ]; then
    pwd
    return 0
  fi
  return 1
}
