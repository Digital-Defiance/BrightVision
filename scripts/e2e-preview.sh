#!/usr/bin/env sh
# Playwright webServer: E2E build + vite preview on 4173.
# Frees the port first so a stale preview does not make yarn test:e2e fail.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
sh "$(dirname "$0")/free-e2e-preview-port.sh"
PORT="${E2E_PREVIEW_PORT:-4173}"
export E2E=1

file_mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1"
}

ui_sources_newer_than_dist() {
  [ -f dist/index.html ] || return 1
  dist_ts="$(file_mtime dist/index.html)"
  # Compare against the entire UI source tree, not a hand-maintained marker subset:
  # a stale allowlist silently serves an old bundle when an unlisted file (e.g.
  # TodoPanel.tsx, ChatPanel.tsx) changes, causing spurious e2e failures.
  # `find -newer` lists source files modified after dist/index.html; any hit ⇒ rebuild.
  newer="$(
    find src packages/*/src \
      -type f \
      \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.scss' \) \
      ! -name '*.test.ts' ! -name '*.test.tsx' ! -name '*.spec.ts' \
      -newer dist/index.html \
      -print 2>/dev/null | head -n 1
  )"
  [ -n "$newer" ] && return 0
  # index.html / vite entry html changes also require a rebuild.
  for marker in index.html vite.config.ts; do
    [ -f "$marker" ] || continue
    if [ "$(file_mtime "$marker")" -gt "$dist_ts" ]; then
      return 0
    fi
  done
  return 1
}

# In Test Lab / test:everything, test-local:release may have built dist/ earlier in the run.
# Skip rebuild only when dist exists AND key UI sources are not newer than dist/.
if [ "${BV_E2E_FORCE_BUILD:-}" = "1" ]; then
  echo "e2e-preview: yarn build (BV_E2E_FORCE_BUILD=1)…" >&2
  yarn build
elif [ -f dist/index.html ] && { [ "${BV_E2E_SKIP_BUILD:-}" = "1" ] || [ "${BV_TEST_SUITE_ACTIVE:-}" = "1" ]; }; then
  if ui_sources_newer_than_dist; then
    echo "e2e-preview: dist/ is older than UI sources — rebuilding…" >&2
    yarn build
  else
    echo "e2e-preview: using existing dist/ (skip yarn build; set BV_E2E_FORCE_BUILD=1 to rebuild)…" >&2
  fi
else
  echo "e2e-preview: yarn build…" >&2
  yarn build
fi
echo "e2e-preview: vite preview on 127.0.0.1:${PORT}…" >&2
exec yarn vite preview --host 127.0.0.1 --port "$PORT"
