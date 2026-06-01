#!/usr/bin/env sh
# Load the E2E model into Ollama before LLM pytest (avoids 900s+ retry loops on cold start).
set -eu
HOST="${E2E_OLLAMA_HOST:-${OLLAMA_HOST:-http://127.0.0.1:11434}}"
HOST="${HOST%/}"
RAW="${E2E_OLLAMA_MODEL:-ollama_chat/llama3.2:3b}"
case "$RAW" in
  ollama_chat/*) TAG="${RAW#ollama_chat/}" ;;
  ollama/*) TAG="${RAW#ollama/}" ;;
  *) TAG="$RAW" ;;
esac
echo "ollama-warmup: ${TAG} @ ${HOST}" >&2
if ! curl -sf "${HOST}/api/tags" >/dev/null 2>&1; then
  echo "ollama-warmup: Ollama not reachable at ${HOST}" >&2
  exit 1
fi
# One short generate loads weights; cap wall clock so a stuck daemon fails fast.
curl -sf "${HOST}/api/generate" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"${TAG}\",\"prompt\":\"ok\",\"stream\":false,\"options\":{\"num_predict\":8}}" \
  --max-time "${OLLAMA_WARMUP_MAX_S:-180}" >/dev/null \
  || {
    echo "ollama-warmup: generate failed (pull model: ollama pull ${TAG})" >&2
    exit 1
  }
echo "ollama-warmup: ready" >&2
