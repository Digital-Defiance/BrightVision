#!/usr/bin/env sh
# Free :8741 and verify Vision API from the current repo (run from repo root).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export BRIGHT_VISION_ROOT="$ROOT"
export BV_ROOT="$ROOT"

echo "BrightVision repo: $ROOT"
lsof -ti :8741 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 0.5

PY="${ROOT}/.venv/bin/python3"
if [ ! -x "$PY" ]; then
  echo "Missing $PY — run: source activate.sh" >&2
  exit 1
fi

"$PY" -c "import bright_vision_core, cecli" || {
  echo "Python cannot import engine — run: source activate.sh" >&2
  exit 1
}

BRIGHT_VISION_HEADLESS=1 "$PY" scripts/vision_serve.py --host 127.0.0.1 --port 8741 &
PID=$!
trap 'kill "$PID" 2>/dev/null' EXIT

for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -sf http://localhost:8741/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "=== GET /health ==="
curl -s http://localhost:8741/health
echo ""
echo "=== POST /sessions ==="
curl -s -X POST http://localhost:8741/sessions \
  -H 'Content-Type: application/json' \
  -d "{\"workspace\":\"$ROOT\",\"model\":\"ollama_chat/qwen3.6:27b-q4_K_M\"}"
echo ""
echo "OK — stop this script (Ctrl+C) before starting the desktop app."

wait "$PID"
