#!/usr/bin/env sh
# Load the E2E model via LM Studio CLI before LLM pytest (lms load -y + chat probe).
set -eu
HOST="${BRIGHTVISION_LLM_BACKEND_URL:-${OLLAMA_HOST:-http://127.0.0.1:1234}}"
HOST="${HOST%/}"
API_BASE="${OPENAI_API_BASE:-${HOST}/v1}"
API_BASE="${API_BASE%/}"
RAW="${E2E_OLLAMA_MODEL:-openai/llama-3.2-3b-instruct}"
case "$RAW" in
  openai/*) KEY="${RAW#openai/}" ;;
  ollama_chat/*) KEY="${RAW#ollama_chat/}" ;;
  ollama/*) KEY="${RAW#ollama/}" ;;
  *) KEY="$RAW" ;;
esac
echo "lms-warmup: ${KEY} @ ${API_BASE}" >&2

if ! command -v lms >/dev/null 2>&1; then
  echo "lms-warmup: lms CLI not on PATH" >&2
  exit 1
fi

if ! lms ls --json >/dev/null 2>&1; then
  echo "lms-warmup: LM Studio CLI not reachable (is LM Studio running?)" >&2
  exit 1
fi

if ! lms ls --json 2>/dev/null | grep -q "\"modelKey\":\"${KEY}\""; then
  echo "lms-warmup: model ${KEY} not on disk — download in LM Studio or run: lms get ${KEY}" >&2
  exit 1
fi

if lms ps --json 2>/dev/null | grep -q "\"modelKey\":\"${KEY}\""; then
  ALREADY_LOADED=1
else
  ALREADY_LOADED=0
fi

if [ "${OLLAMA_WARMUP_EXCLUSIVE:-1}" != "0" ]; then
  if [ "${ALREADY_LOADED}" = "1" ] && [ "${OLLAMA_WARMUP_SKIP_IF_LOADED:-0}" != "0" ]; then
    echo "lms-warmup: ${KEY} resident — skipping unload --all" >&2
  else
    echo "lms-warmup: unloading other models (lms unload --all)" >&2
    lms unload --all >/dev/null 2>&1 || true
    ALREADY_LOADED=0
  fi
fi

LOAD_ARGS="-y --identifier ${KEY}"
if [ -n "${BRIGHTVISION_LLM_LOAD_CONTEXT_LENGTH:-}" ]; then
  LOAD_ARGS="${LOAD_ARGS} --context-length ${BRIGHTVISION_LLM_LOAD_CONTEXT_LENGTH}"
fi
if [ -n "${BRIGHTVISION_LLM_LOAD_PARALLEL:-}" ]; then
  LOAD_ARGS="${LOAD_ARGS} --parallel ${BRIGHTVISION_LLM_LOAD_PARALLEL}"
fi

if [ "${ALREADY_LOADED}" = "1" ]; then
  echo "lms-warmup: ${KEY} already loaded — skipping lms load" >&2
else
  # shellcheck disable=SC2086
  if ! lms load "${KEY}" ${LOAD_ARGS} >/dev/null 2>&1; then
    echo "lms-warmup: lms load ${KEY} failed" >&2
    exit 1
  fi
fi

# lms load does not start the OpenAI-compatible HTTP server — ensure it is listening.
SERVER_PORT=1234
case "$HOST" in
  *:*) SERVER_PORT="${HOST##*:}"; SERVER_PORT="${SERVER_PORT%%/*}" ;;
esac
MODELS_URL="${API_BASE}/models"
if [ "${MODELS_URL#http}" = "$MODELS_URL" ]; then
  MODELS_URL="http://${MODELS_URL#//}"
fi
if ! curl -sf "${MODELS_URL}" -H 'Authorization: Bearer lm-studio' --max-time 5 >/dev/null 2>&1; then
  echo "lms-warmup: Local Server not reachable — starting (lms server start -p ${SERVER_PORT})" >&2
  if ! lms server start -p "${SERVER_PORT}" >/dev/null 2>&1; then
    echo "lms-warmup: lms server start failed — enable Developer → Local Server in LM Studio on ${HOST}" >&2
    exit 1
  fi
  i=0
  while [ "$i" -lt 30 ]; do
    if curl -sf "${MODELS_URL}" -H 'Authorization: Bearer lm-studio' --max-time 3 >/dev/null 2>&1; then
      break
    fi
    i=$((i + 1))
    sleep 0.2
  done
elif [ "${LMS_WARMUP_RESTART_SERVER:-0}" != "0" ]; then
  echo "lms-warmup: restarting Local Server (recover mid-suite)" >&2
  lms server stop >/dev/null 2>&1 || true
  sleep 0.5
  if ! lms server start -p "${SERVER_PORT}" >/dev/null 2>&1; then
    echo "lms-warmup: lms server restart failed on ${HOST}" >&2
    exit 1
  fi
  i=0
  while [ "$i" -lt 30 ]; do
    if curl -sf "${MODELS_URL}" -H 'Authorization: Bearer lm-studio' --max-time 3 >/dev/null 2>&1; then
      break
    fi
    i=$((i + 1))
    sleep 0.2
  done
fi

CHAT_URL="${API_BASE}/chat/completions"
if [ "${API_BASE#http}" = "$API_BASE" ]; then
  CHAT_URL="http://${CHAT_URL#//}"
fi
if curl -sf "${CHAT_URL}" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer lm-studio' \
  -d "{\"model\":\"${KEY}\",\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}],\"max_tokens\":8,\"stream\":false}" \
  --max-time "${LMS_WARMUP_MAX_S:-180}" >/dev/null; then
  echo "lms-warmup: ready" >&2
  exit 0
fi

echo "lms-warmup: chat probe failed for ${KEY} at ${CHAT_URL}" >&2
echo "lms-warmup: ensure LM Studio is running and Local Server works: lms server start -p ${SERVER_PORT}" >&2
exit 1
