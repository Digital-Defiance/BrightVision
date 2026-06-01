#!/usr/bin/env sh
# Fast EARS + spec-index gate (no Ollama). Used by yarn verify:ears.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="${E2E_PYTHON:-.venv/bin/python3}"
if [ ! -x "$PY" ]; then
  echo "verify-ears: need .venv (source activate.sh)" >&2
  exit 1
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
