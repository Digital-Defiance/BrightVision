#!/usr/bin/env sh
# Reset an e2e fixture git repo so the next test run re-seeds from ensure*().
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "Usage: sh scripts/init-e2e-fixture.sh <workspace-dir-name>" >&2
  echo "  edit-block-workspace | tasks-seeded-workspace | context-workspace | hello-workspace" >&2
  exit 1
fi
DIR="${ROOT}/e2e/fixtures/${NAME}"
if [ ! -d "$DIR" ]; then
  echo "Unknown fixture: $DIR" >&2
  exit 1
fi
rm -rf "${DIR}/.git"
echo "Removed ${DIR}/.git"
echo "Re-seed: yarn test:e2e --grep \"${NAME}\""
echo "  or run any test that calls ensure* for ${NAME}"
