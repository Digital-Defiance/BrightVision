#!/usr/bin/env sh
# Initialize brightdate-python submodule after clone (roadmap #47).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .gitmodules ] || ! grep -q 'brightdate-python' .gitmodules 2>/dev/null; then
  echo "Missing brightdate-python in .gitmodules — update parent repo first." >&2
  exit 1
fi

git submodule sync brightdate-python
git submodule update --init brightdate-python

if [ ! -f brightdate-python/pyproject.toml ]; then
  echo "brightdate-python checkout empty — has the upstream repo been pushed?" >&2
  echo "  Maintainer: see brightdate-python/PUBLISH.md and docs/BRIGHTDATE_PYTHON.md" >&2
  exit 1
fi

echo "OK: brightdate-python at $(git -C brightdate-python rev-parse --short HEAD 2>/dev/null || echo '?')"
