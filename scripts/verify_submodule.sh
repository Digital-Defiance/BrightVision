#!/usr/bin/env sh
# Roadmap #19: run submodule checks with project venv when available.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -x ".venv/bin/python3" ]; then
  exec .venv/bin/python3 scripts/verify_submodule_workspace.py "$@"
fi
if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/verify_submodule_workspace.py "$@"
fi
echo "No python3 found" >&2
exit 1
