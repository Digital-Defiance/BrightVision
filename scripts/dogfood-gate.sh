#!/usr/bin/env sh
# Full automated dogfood gate (no GUI). Called by yarn dogfood:agent / dogfood:gate.
# Optional LLM lane when Ollama is up and DOGFOOD_LLM=1.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

step() {
  printf '\n== %s ==\n' "$1"
}

step "Dogfood preflight"
yarn dogfood:check

step "Release tier (mocked e2e + bright-core + integration)"
if [ -x .venv/bin/python3 ]; then
  sh scripts/test-local.sh release
else
  echo "WARN: no .venv — running test-local.sh full only"
  sh scripts/test-local.sh full
fi

if [ "${DOGFOOD_LLM:-}" = "1" ]; then
  step "LLM core pytest"
  if command -v curl >/dev/null 2>&1; then
    host="${OLLAMA_HOST:-http://127.0.0.1:11434}"
    host="${host%/}"
    if curl -sf "${host}/api/tags" >/dev/null 2>&1; then
      export VISION_AGENT_PREPROC_TIMEOUT_S="${VISION_AGENT_PREPROC_TIMEOUT_S:-600}"
      export VISION_SLASH_PREPROC_TIMEOUT_S="${VISION_SLASH_PREPROC_TIMEOUT_S:-300}"
      export LLM_TEST_TURN_TIMEOUT_S="${LLM_TEST_TURN_TIMEOUT_S:-300}"
      yarn test:llm:core
      step "LLM Playwright (standard lane)"
      yarn test:e2e:llm
      if [ "${DOGFOOD_SUPERPROJECT_LLM:-}" = "1" ]; then
        step "LLM Playwright (superproject lane)"
        E2E_SUPERPROJECT_LLM=1 yarn test:e2e:llm:superproject
      fi
    else
      echo "WARN: DOGFOOD_LLM=1 but Ollama not reachable — skipping LLM tiers"
    fi
  fi
else
  echo "SKIP: LLM tiers (set DOGFOOD_LLM=1 when Ollama is running)"
fi

printf '\nDogfood gate OK.\n'
