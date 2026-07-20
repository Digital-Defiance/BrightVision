#!/usr/bin/env bash
# Recreate pr/brightvision-cecli-only from upstream/main + cecli code deltas only.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Run inside cecli submodule (Digital-Defiance/cecli or legacy BrightVision-core/cecli tree).
CECLI_ROOT="${CECLI_ROOT:-}"
if [ -z "$CECLI_ROOT" ]; then
  if [ -d "${ROOT}/cecli/.git" ] || [ -f "${ROOT}/cecli/pyproject.toml" ]; then
    CECLI_ROOT="${ROOT}/cecli"
  elif [ -d "${ROOT}/BrightVision-core/.git" ]; then
    CECLI_ROOT="${ROOT}/BrightVision-core"
  else
    echo "Set CECLI_ROOT to your cecli checkout" >&2
    exit 1
  fi
fi
cd "$CECLI_ROOT"

git remote add upstream https://github.com/dwash96/cecli.git 2>/dev/null || true
git fetch upstream

SOURCE_BRANCH="${1:-main}"
TARGET_BRANCH="pr/brightvision-cecli-only"

git checkout -B "$TARGET_BRANCH" "upstream/main"
git checkout "$SOURCE_BRANCH" -- cecli/commands/add.py cecli/models.py

if git diff --cached --quiet; then
  echo "No cecli delta vs upstream — nothing to commit."
  exit 0
fi

git commit -m "$(cat <<'EOF'
Improve /add ignore feedback and Ollama keep_alive defaults

- /add: clearer errors when paths are blocked by .gitignore vs .cecli.ignore
- models: default keep_alive=-1 for Ollama LiteLLM calls
EOF
)"

echo "Branch $TARGET_BRANCH ready. Push and open PR:"
echo "  git push -u origin $TARGET_BRANCH"
  echo "  See docs/CECLI_UPSTREAM_PR.md"
