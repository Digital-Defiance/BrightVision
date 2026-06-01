#!/usr/bin/env sh
# Install repo git hooks (optional EARS verify on commit).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_SRC="$ROOT/scripts/git-hooks/pre-commit"
HOOK_DST="$ROOT/.git/hooks/pre-commit"
if [ ! -d "$ROOT/.git/hooks" ]; then
  echo "install-git-hooks: not a git repo" >&2
  exit 1
fi
cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"
echo "Installed $HOOK_DST (runs yarn verify:ears when .venv exists)"
