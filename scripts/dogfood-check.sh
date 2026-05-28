#!/usr/bin/env sh
# Preflight for BrightVision self-dev (local Ollama + superproject workspace).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "dogfood-check: $*" >&2
  exit 1
}

step() {
  printf '\n== %s ==\n' "$1"
}

step "Repo layout"
test -f bright_vision_core/session.py || fail "missing bright_vision_core/session.py"
test -d cecli/cecli || fail "missing cecli submodule (git submodule update --init cecli)"

step "Python venv"
if [ ! -x .venv/bin/python3 ]; then
  echo "WARN: no .venv — run: source activate.sh"
else
  .venv/bin/python3 -c "import bright_vision_core, cecli" || fail "editable installs broken (source activate.sh)"
fi

step "Submodule workspace verify"
yarn verify:submodule

step "TypeScript unit + types"
yarn test:fast

if [ -x .venv/bin/python3 ]; then
  step "Bright core pytest"
  .venv/bin/python3 -m pytest \
    tests/core/test_workspace_paths.py \
    tests/core/test_headless_args.py \
    tests/core/test_superproject_integration.py \
    tests/core/test_superproject_dogfood.py \
    tests/core/test_roadmap_hints.py \
    tests/core/test_cecli_tool_json.py \
    -q
fi

step "Ollama (optional)"
if command -v curl >/dev/null 2>&1; then
  host="${OLLAMA_HOST:-http://127.0.0.1:11434}"
  host="${host%/}"
  if curl -sf "${host}/api/tags" >/dev/null 2>&1; then
    echo "PASS: Ollama reachable at ${host}"
    if [ -f local-llm.env ]; then
      echo "PASS: local-llm.env present"
    else
      echo "WARN: no local-llm.env — copy from local-llm.env.example"
    fi
  else
    echo "WARN: Ollama not reachable at ${host} (start Ollama before yarn tauri dev)"
  fi
else
  echo "SKIP: curl not found"
fi

printf '\nDogfood preflight OK. Next: yarn dogfood:agent (see docs/DOGFOOD.md)\n'
