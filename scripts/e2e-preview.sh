#!/usr/bin/env sh
# Playwright webServer: E2E build + vite preview on 4173.
# Frees the port first so a stale preview does not make yarn test:e2e fail.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
sh "$(dirname "$0")/free-e2e-preview-port.sh"
PORT="${E2E_PREVIEW_PORT:-4173}"
export E2E=1
yarn build
exec yarn vite preview --host 127.0.0.1 --port "$PORT"
