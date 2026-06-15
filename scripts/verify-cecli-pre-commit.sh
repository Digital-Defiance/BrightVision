#!/usr/bin/env bash
# Run cecli upstream CI pre-commit hooks (isort, black, flake8) before push/PR.
#
# Uses BrightVision .venv when present so Black 26.x matches cecli-dev CI (Ubuntu 3.12).
# System python3.9 cannot install black==26.3.1 — you will get false greens or false reds.
#
# Usage (from BrightVision root or cecli submodule):
#   sh scripts/verify-cecli-pre-commit.sh          # fail if hooks would change files
#   sh scripts/verify-cecli-pre-commit.sh --fix    # apply hook fixes, then pass
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -d "${ROOT}/cecli/.git" ] || [ -f "${ROOT}/cecli/.pre-commit-config.yaml" ]; then
  CECLI_ROOT="${ROOT}/cecli"
elif [ -f "${ROOT}/.pre-commit-config.yaml" ]; then
  CECLI_ROOT="${ROOT}"
else
  echo "verify-cecli-pre-commit: cecli checkout not found" >&2
  exit 1
fi

FIX=0
if [ "${1:-}" = "--fix" ]; then
  FIX=1
elif [ -n "${1:-}" ]; then
  echo "usage: $0 [--fix]" >&2
  exit 1
fi

pick_python() {
  local candidate
  for candidate in \
    "${ROOT}/.venv/bin/python3" \
    "${PYTHON:-}" \
    "$(command -v python3.14 2>/dev/null || true)" \
    "$(command -v python3.13 2>/dev/null || true)" \
    "$(command -v python3.12 2>/dev/null || true)" \
    "$(command -v python3.11 2>/dev/null || true)" \
    "$(command -v python3.10 2>/dev/null || true)" \
    "$(command -v python3 2>/dev/null || true)"
  do
    [ -n "$candidate" ] || continue
    [ -x "$candidate" ] || continue
    if "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

PY="$(pick_python)" || {
  echo "verify-cecli-pre-commit: need Python >= 3.10 (source activate.sh for .venv)" >&2
  exit 1
}

echo "verify-cecli-pre-commit: ${CECLI_ROOT} (python=$("$PY" --version 2>&1))" >&2

"$PY" -m pip install -q pre-commit

cd "$CECLI_ROOT"

HOOKS=(isort black flake8)
FAILED=0
for hook in "${HOOKS[@]}"; do
  echo "==> pre-commit run ${hook}" >&2
  if ! "$PY" -m pre_commit run "$hook" --all-files; then
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  if [ "$FIX" -eq 1 ]; then
    echo "verify-cecli-pre-commit: hooks modified files — review and commit" >&2
    exit 0
  fi
  echo "verify-cecli-pre-commit: failed (run with --fix to apply formatting)" >&2
  exit 1
fi

echo "verify-cecli-pre-commit: ok" >&2
