#!/usr/bin/env sh
# Fast EARS + spec-index gate (no Ollama). Used by yarn verify:ears.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VENV_PY="${ROOT}/.venv/bin/python3"
# Always prefer repo .venv over inherited E2E_PYTHON (may point at system Python).
if [ -x "$VENV_PY" ]; then
  PY="$VENV_PY"
elif [ -n "${E2E_PYTHON:-}" ] && [ -x "$E2E_PYTHON" ]; then
  PY="$E2E_PYTHON"
else
  echo "verify-ears: need .venv (source activate.sh)" >&2
  exit 1
fi
if ! "$PY" -c 'import pytest' 2>/dev/null; then
  export BRIGHT_VISION_ROOT="$ROOT"
  export BV_ROOT="$ROOT"
  # shellcheck source=ensure-venv.sh
  . "${ROOT}/scripts/ensure-venv.sh" || true
  if ! "$PY" -c 'import pytest' 2>/dev/null; then
    echo "verify-ears: pytest missing in .venv — run: source activate.sh" >&2
    exit 1
  fi
fi
exec "$PY" -m pytest \
  tests/core/test_ears_lint.py \
  tests/core/test_ears_index.py \
  tests/core/test_ears_trace.py \
  tests/core/test_http_ears_lint.py \
  tests/core/test_http_ears_index_trace.py \
  tests/core/test_generate_spec_parse.py \
  tests/core/test_http_generate_spec_mock.py \
  tests/core/test_todo_spec_ears.py \
  tests/core/test_todo_spec_phased.py \
  -q
