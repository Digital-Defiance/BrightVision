#!/usr/bin/env bash
# Measure "true" diff in aider-vision-core: exclude website/, discount pure renames.
# Usage: ./scripts/measure-true-diff.sh [BASE_REF]
# Default BASE: commit before aider→aider_vision_core rename (994947a55^).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CORE="${CORE:-$ROOT/aider-vision-core}"

if ! git -C "$CORE" rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not a git repo: $CORE" >&2
  exit 1
fi

GIT=(git -C "$CORE")

BASE="${1:-$("${GIT[@]}" rev-parse '994947a55^')}"
HEAD="${HEAD:-HEAD}"

EXCLUDE=(
  ':(exclude)*/website/*'
  ':(exclude)website/*'
  ':(exclude)aider/website/*'
  ':(exclude)aider_vision_core/website/*'
)

echo "=== aider-vision-core: true change vs rename base ==="
echo "Base: $BASE ($("${GIT[@]}" log -1 --oneline "$BASE"))"
echo "Head: $HEAD ($("${GIT[@]}" log -1 --oneline "$HEAD"))"
echo "Excluded: **/website/**"
echo ""

echo "--- Raw diff (no rename detection) ---"
"${GIT[@]}" diff "$BASE".."$HEAD" --stat "${EXCLUDE[@]}" . 2>/dev/null | tail -5

echo ""
echo "--- With rename detection (-M90%) ---"
"${GIT[@]}" diff "$BASE".."$HEAD" -M90% --stat "${EXCLUDE[@]}" . 2>/dev/null | tail -5

echo ""
echo "--- Rename-only summary (similarity rename, no content intent) ---"
"${GIT[@]}" diff "$BASE".."$HEAD" -M90% --summary "${EXCLUDE[@]}" . 2>/dev/null | grep -E 'rename |create |delete ' | head -40
RENAME_COUNT=$("${GIT[@]}" diff "$BASE".."$HEAD" -M90% --summary "${EXCLUDE[@]}" . 2>/dev/null | grep -c ' rename ' || true)
echo "rename entries (summary lines): $RENAME_COUNT"

echo ""
echo "--- Numstat: lines added/deleted (excl. website, -M90%) ---"
NUMSTAT=$("${GIT[@]}" diff "$BASE".."$HEAD" -M90% --numstat "${EXCLUDE[@]}" . 2>/dev/null)
ADD=0
DEL=0
while read -r a d _; do
  [[ "$a" == "-" ]] && continue
  ADD=$((ADD + a))
  DEL=$((DEL + d))
done <<< "$NUMSTAT"
echo "insertions: $ADD"
echo "deletions: $DEL"
echo "net lines: $((ADD - DEL))"

echo ""
echo "--- Rename-discounted split (numstat paths with '=>' are paired renames) ---"
awk '
/\{/ && /=>/ { ra+=$1; rd+=$2; rn++ ; next }
{ na+=$1; nd+=$2; nn++ }
END {
  printf "  renamed files with edits: %d  (+%d / -%d)\n", rn+0, ra+0, rd+0
  printf "  brand-new paths:          %d  (+%d / -%d)\n", nn+0, na+0, nd+0
}' <<< "$NUMSTAT"

VISION_PATHS=(
  aider_vision_core/http_api.py
  aider_vision_core/http_auth.py
  aider_vision_core/session.py
  aider_vision_core/git_workspace.py
  aider_vision_core/workspace_todos.py
  aider_vision_core/event_io.py
  aider_vision_core/headless_stdio.py
  aider_vision_core/vision_runtime.py
  aider_vision_core/vision_serve.py
  aider_vision_core/cli_serve.py
  aider_vision_core/todo_markdown.py
  aider_vision_core/todo_spec_generate.py
  aider_vision_core/todo_spec_jobs.py
)
echo ""
echo "--- Vision integration layer (13 modules, all new since base) ---"
"${GIT[@]}" diff "$BASE".."$HEAD" -M90% --numstat "${EXCLUDE[@]}" -- "${VISION_PATHS[@]}" 2>/dev/null | awk '{a+=$1;d+=$2} END{printf "  +%d / -%d lines\n", a+0, d+0}'

echo ""
echo "--- New files only (not renames), excl. website ---"
"${GIT[@]}" diff "$BASE".."$HEAD" -M90% --diff-filter=A --name-only "${EXCLUDE[@]}" . 2>/dev/null | grep -v '/website/' | head -30
NEW_COUNT=$("${GIT[@]}" diff "$BASE".."$HEAD" -M90% --diff-filter=A --name-only "${EXCLUDE[@]}" . 2>/dev/null | grep -v '/website/' | wc -l | tr -d ' ')
echo "... total new paths: $NEW_COUNT"

echo ""
echo "--- Vision integration paths (new or heavily changed since base) ---"
for f in \
  aider_vision_core/http_api.py \
  aider_vision_core/http_auth.py \
  aider_vision_core/session.py \
  aider_vision_core/git_workspace.py \
  aider_vision_core/workspace_todos.py \
  aider_vision_core/event_io.py \
  aider_vision_core/headless_stdio.py \
  aider_vision_core/vision_runtime.py \
  aider_vision_core/vision_serve.py \
  aider_vision_core/cli_serve.py \
  aider_vision_core/todo_markdown.py \
  aider_vision_core/todo_spec_generate.py \
  aider_vision_core/todo_spec_jobs.py; do
  if [[ -f "$CORE/$f" ]]; then
    if "${GIT[@]}" diff "$BASE".."$HEAD" -M90% --numstat -- "$f" 2>/dev/null | grep -q .; then
      "${GIT[@]}" diff "$BASE".."$HEAD" -M90% --numstat -- "$f" 2>/dev/null
    else
      echo "-	-	$f  (unchanged vs base or new before track)"
    fi
  fi
done

echo ""
echo "=== aider_vision_core vs cecli (content, not git) ==="
echo "Run: python3 scripts/compare-cores.py"
echo "See: docs/CORE_FILE_MERGE.md"
