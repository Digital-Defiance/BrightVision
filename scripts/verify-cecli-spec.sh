#!/usr/bin/env sh
# Run cecli.spec unit tests (no BrightVision HTTP). Safe from cecli repo root or BV superproject.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -d "${ROOT}/cecli/tests/spec" ]; then
  SPEC_DIR="${ROOT}/cecli/tests/spec"
  CECLI_ROOT="${ROOT}/cecli"
else
  SPEC_DIR="${ROOT}/tests/spec"
  CECLI_ROOT="${ROOT}"
fi
VENV_PY="${ROOT}/.venv/bin/python3"
if [ -x "$VENV_PY" ]; then
  PY="$VENV_PY"
else
  PY="${PYTHON:-python3}"
fi
if ! "$PY" -c 'import cecli.spec' 2>/dev/null; then
  (cd "$CECLI_ROOT" && "$PY" -m pip install -e . -q)
fi
exec "$PY" -m pytest "$SPEC_DIR" -q "$@"
