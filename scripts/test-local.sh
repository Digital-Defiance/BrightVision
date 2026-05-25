#!/usr/bin/env sh
# Local verification tiers — run on your machine (CI not required).
# Workflows under .github/workflows/ are optional if you enable Actions later.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TIER="${1:-fast}"

usage() {
  echo "Usage: sh scripts/test-local.sh [tier]" >&2
  echo "  fast     — TypeScript check + Vitest (~seconds)" >&2
  echo "  local    — fast + Rust git_ops tests" >&2
  echo "  full     — local + Playwright e2e (~1–2 min)" >&2
  echo "  release  — full + yarn verify:submodule (needs .venv)" >&2
  exit 1
}

case "$TIER" in
  fast)
    yarn tsc --noEmit
    yarn test
    ;;
  local)
    yarn tsc --noEmit
    yarn test
    yarn test:rust
    ;;
  full)
    yarn tsc --noEmit
    yarn test
    yarn test:rust
    yarn test:e2e
    ;;
  release)
    yarn tsc --noEmit
    yarn test
    yarn test:rust
    yarn test:e2e
    if [ -x ".venv/bin/python" ]; then
      yarn verify:submodule
    else
      echo "Note: skipping yarn verify:submodule (no .venv — run: source activate.sh)" >&2
    fi
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    ;;
esac

echo "OK — local tier: $TIER"
