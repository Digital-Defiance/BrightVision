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

# Other models pinned in VRAM (keep_alive=-1 / Forever) can block generate on the E2E tag.
if [ "${OLLAMA_WARMUP_EXCLUSIVE:-1}" != "0" ] && command -v ollama >/dev/null 2>&1; then
  ollama ps 2>/dev/null | tail -n +2 | while read -r line; do
    name=$(printf '%s\n' "$line" | awk '{print $1}')
    [ -z "$name" ] && continue
    [ "$name" = "$TAG" ] && continue
    echo "ollama-warmup: unloading ${name} (free VRAM for ${TAG})" >&2
    ollama stop "$name" >/dev/null 2>&1 || true
  done
fi

# One short generate loads weights; cap wall clock so a stuck daemon fails fast.
if curl -sf "${HOST}/api/generate" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"${TAG}\",\"prompt\":\"ok\",\"stream\":false,\"options\":{\"num_predict\":8}}" \
  --max-time "${OLLAMA_WARMUP_MAX_S:-180}" >/dev/null; then
  echo "ollama-warmup: ready" >&2
  exit 0
fi

echo "ollama-warmup: generate failed for ${TAG}" >&2
if curl -sf "${HOST}/api/tags" | grep -q "\"name\":\"${TAG}\""; then
  echo "ollama-warmup: model is pulled but generate timed out — unload other models (ollama ps) or raise OLLAMA_WARMUP_MAX_S" >&2
else
  echo "ollama-warmup: model missing — run: ollama pull ${TAG}" >&2
fi
exit 1
