#!/usr/bin/env sh
# Run cecli.hopper unit tests (no host HTTP). Safe from cecli repo root or BV superproject.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -d "${ROOT}/cecli/tests/hopper" ]; then
  HOPPER_DIR="${ROOT}/cecli/tests/hopper"
  CECLI_ROOT="${ROOT}/cecli"
else
  HOPPER_DIR="${ROOT}/tests/hopper"
  CECLI_ROOT="${ROOT}"
fi
VENV_PY="${ROOT}/.venv/bin/python3"
if [ -x "$VENV_PY" ]; then
  PY="$VENV_PY"
else
  PY="${PYTHON:-python3}"
fi
if ! "$PY" -c 'import cecli.hopper' 2>/dev/null; then
  (cd "$CECLI_ROOT" && "$PY" -m pip install -e . -q)
fi
exec "$PY" -m pytest "$HOPPER_DIR" -q "$@"
