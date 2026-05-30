#!/usr/bin/env bash
# 100% automated confidence suite: dogfood:check + release + fixtures + full LLM
# (core pytest, e2e:llm, superproject-llm). Superset of DOGFOOD_LLM=1 + DOGFOOD_SUPERPROJECT_LLM=1
# dogfood:gate without re-running release twice. See docs/TESTING.md.
# Usage: source activate.sh && bash scripts/test-everything.sh
#   --logged   Tee live output to the terminal; ansifilter writes test-everything-log.txt
# Each step is timed with btime (BrightDate units). Requires btime on PATH (e.g. Homebrew).
# Set SKIP_TIME=1 to disable timing. Set SKIP_LLM=1 to skip LLM tiers when Ollama is down.
# Set TEST_EVERYTHING_LOG to override the --logged output path.
# Exit 0 only if every step succeeded; keeps running after failures for full report.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_FILE="${TEST_EVERYTHING_LOG:-$ROOT/test-everything-log.txt}"
LOGGED_INNER="${BV_TEST_EVERYTHING_LOGGED_INNER:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --logged)
      if [ -n "$LOGGED_INNER" ]; then
        echo "error: --logged cannot be nested" >&2
        exit 1
      fi
      if ! command -v ansifilter >/dev/null 2>&1; then
        echo "error: ansifilter not on PATH (required for --logged)" >&2
        exit 1
      fi
      if ! command -v tee >/dev/null 2>&1; then
        echo "error: tee not on PATH (required for --logged)" >&2
        exit 1
      fi
      export BV_TEST_EVERYTHING_LOGGED_INNER=1
      # Live transcript on stdout; parallel strip ANSI into the log file.
      bash "$0" --logged-inner "${@:2}" 2>&1 | tee >(ansifilter -o "$LOG_FILE")
      exit "${PIPESTATUS[0]}"
      ;;
    --logged-inner)
      if [ -z "$LOGGED_INNER" ]; then
        echo "error: internal --logged-inner without --logged wrapper" >&2
        exit 1
      fi
      shift
      ;;
    -h | --help)
      echo "Usage: bash scripts/test-everything.sh [--logged]"
      echo "  --logged   Tee to terminal + test-everything-log.txt (ansifilter strips ANSI in file)"
      echo "  Env: SKIP_TIME=1 SKIP_LLM=1 TEST_EVERYTHING_LOG=/path/to.log"
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

FAILED=0

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_GREEN=$'\033[0;32m'
  C_RED=$'\033[0;31m'
  C_BOLD=$'\033[1m'
  C_RESET=$'\033[0m'
else
  C_GREEN=''
  C_RED=''
  C_BOLD=''
  C_RESET=''
fi

ok() { printf '%s%s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
fail() { printf '%s%s%s\n' "$C_RED" "$*" "$C_RESET"; }

USE_TIME=1
if [ -n "${SKIP_TIME:-}" ]; then
  USE_TIME=0
elif ! command -v btime >/dev/null 2>&1; then
  echo "error: btime not on PATH (brew install btime). Set SKIP_TIME=1 to disable timing." >&2
  exit 1
fi

# Print banner, run command under btime, print [ SUCCESS ] or [ FAIL ]. Keeps going after failures.
run_step() {
  local label="$1"
  shift
  echo "> $label"
  echo "----------------------------------------------------------------------------------"
  if [ "$USE_TIME" -eq 1 ]; then
    run_cmd=(btime "$@")
  else
    run_cmd=("$@")
  fi
  if "${run_cmd[@]}"; then
    ok "[ SUCCESS ]"
    echo
    return 0
  fi
  fail "[ FAIL ]"
  echo
  FAILED=1
  return 1
}

ollama_reachable() {
  command -v curl >/dev/null 2>&1 || return 1
  local host="${OLLAMA_HOST:-http://127.0.0.1:11434}"
  host="${host%/}"
  curl -sf "${host}/api/tags" >/dev/null 2>&1
}

run_llm_steps() {
  if ollama_reachable; then
    export VISION_AGENT_PREPROC_TIMEOUT_S="${VISION_AGENT_PREPROC_TIMEOUT_S:-600}"
    export VISION_SLASH_PREPROC_TIMEOUT_S="${VISION_SLASH_PREPROC_TIMEOUT_S:-300}"
    export LLM_TEST_TURN_TIMEOUT_S="${LLM_TEST_TURN_TIMEOUT_S:-300}"
    run_step "yarn test:llm:core" yarn test:llm:core
    run_step "E2E_LLM=1 yarn test:e2e:llm" env E2E_LLM=1 yarn test:e2e:llm
    run_step "E2E_SUPERPROJECT_LLM=1 yarn test:e2e:llm:superproject" \
      env E2E_SUPERPROJECT_LLM=1 yarn test:e2e:llm:superproject
    return 0
  fi
  if [ "${SKIP_LLM:-}" = "1" ]; then
    echo "SKIP: LLM tiers (Ollama not reachable; SKIP_LLM=1)" >&2
    return 0
  fi
  fail 'LLM tiers skipped: Ollama not reachable (start Ollama or set SKIP_LLM=1)'
  echo
  FAILED=1
  return 1
}

run_step "yarn dogfood:check" yarn dogfood:check

run_step "sh scripts/test-local.sh release" sh scripts/test-local.sh release

run_step "yarn test:e2e:fixtures" yarn test:e2e:fixtures

run_llm_steps

if [ "$FAILED" -eq 0 ]; then
  echo
  printf '%s%s%s\n' "${C_BOLD}" '> ALL TEST SUITES SUCCESSFUL <' "${C_RESET}"
  exit 0
fi

echo
fail 'One or more steps failed.'
exit 1
