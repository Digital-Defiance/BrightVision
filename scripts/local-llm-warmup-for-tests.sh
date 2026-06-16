#!/usr/bin/env sh
# Dispatch warmup to Ollama or LM Studio based on BRIGHTVISION_LLM_BACKEND / local-llm.env.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
BACKEND="${BRIGHTVISION_LLM_BACKEND:-}"
if [ -z "$BACKEND" ] && [ -f "${ROOT}/local-llm.env" ]; then
  BACKEND="$(grep -E '^BRIGHTVISION_LLM_BACKEND=' "${ROOT}/local-llm.env" | tail -1 | cut -d= -f2- | tr -d "\"'" || true)"
fi
BACKEND="$(printf '%s' "${BACKEND:-ollama}" | tr '[:upper:]' '[:lower:]')"
case "$BACKEND" in
  lmstudio|lm-studio|lm_studio)
    exec sh "${ROOT}/scripts/lms-warmup-for-tests.sh"
    ;;
  *)
    exec sh "${ROOT}/scripts/ollama-warmup-for-tests.sh"
    ;;
esac
