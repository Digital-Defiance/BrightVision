#!/usr/bin/env bash
# OPTIONAL bulk copy of Vision-only modules into bright-vision-core/bright_vision_core/.
# This is NOT a finished migration — every file must be rewired to import cecli, not aider_vision_core.
# Prefer: python3 scripts/compare-cores.py and docs/CORE_FILE_MERGE.md (file-by-file).
# Run from the aider-vision repo root. Does NOT replace cecli/.
#
# Usage:
#   ./scripts/port-vision-core-to-bright.sh              # dry-run (default)
#   ./scripts/port-vision-core-to-bright.sh --apply    # write files
#   ./scripts/port-vision-core-to-bright.sh --apply --full-tree  # entire aider_vision_core → bright_vision_core (heavy)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/aider-vision-core"
DST="${ROOT}/bright-vision-core"

APPLY=false
FULL=false
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --full-tree) FULL=true ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
  esac
done

RSYNC=(rsync -a --human-readable --itemize-changes)
if ! $APPLY; then
  RSYNC+=(--dry-run)
  echo "DRY RUN — pass --apply to write into bright-vision-core"
fi

if [[ ! -d "$SRC/aider_vision_core" ]]; then
  echo "Missing $SRC/aider_vision_core — init aider-vision-core submodule first." >&2
  exit 1
fi
if [[ ! -d "$DST/cecli" ]]; then
  echo "Missing $DST/cecli — init bright-vision-core submodule first." >&2
  exit 1
fi

# Vision-only modules (HTTP API, session, todos, headless, git workspace for superprojects).
# Excludes the bulk of coders/llm/main — cecli stays authoritative for the agent loop.
VISION_PY=(
  http_api.py
  http_auth.py
  session.py
  vision_runtime.py
  vision_serve.py
  cli_serve.py
  git_workspace.py
  workspace_todos.py
  todo_markdown.py
  todo_spec_generate.py
  todo_spec_jobs.py
  headless_stdio.py
  brand.py
  event_io.py
  gui_progress.py
)

VISION_SCRIPTS=(
  vision_serve.py
  vision_jsonl.py
)

VISION_TESTS=(
  test_http_api.py
  test_git_workspace.py
  test_http_session_todos.py
)

rename_imports() {
  local dir="$1"
  if ! $APPLY; then
    echo "Would run import renames under $dir (aider_vision_core → bright_vision_core)"
    return 0
  fi
  # First pass: package name only. cecli imports are manual follow-up.
  if command -v rg >/dev/null 2>&1; then
    rg -l 'aider_vision_core' "$dir" -g '*.py' 2>/dev/null | while read -r f; do
      sed -i '' 's/aider_vision_core/bright_vision_core/g' "$f" 2>/dev/null \
        || sed -i 's/aider_vision_core/bright_vision_core/g' "$f"
    done
  fi
}

echo "Source: $SRC"
echo "Target: $DST"
echo ""

if $FULL; then
  echo "=== FULL TREE: aider_vision_core/ → bright_vision_core/ (does not delete cecli/) ==="
  mkdir -p "$DST/bright_vision_core"
  "${RSYNC[@]}" \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.aider.tags.cache.*' \
    "$SRC/aider_vision_core/" "$DST/bright_vision_core/"
  rename_imports "$DST/bright_vision_core"
else
  echo "=== LAYERED PORT: Vision modules → bright_vision_core/ ==="
  mkdir -p "$DST/bright_vision_core"
  for f in "${VISION_PY[@]}"; do
    if [[ -f "$SRC/aider_vision_core/$f" ]]; then
      "${RSYNC[@]}" "$SRC/aider_vision_core/$f" "$DST/bright_vision_core/$f"
    else
      echo "skip (missing): $f"
    fi
  done
  rename_imports "$DST/bright_vision_core"
fi

echo ""
echo "=== scripts/ ==="
mkdir -p "$DST/scripts"
for f in "${VISION_SCRIPTS[@]}"; do
  if [[ -f "$SRC/scripts/$f" ]]; then
    "${RSYNC[@]}" "$SRC/scripts/$f" "$DST/scripts/$f"
  fi
done
if $APPLY; then
  rename_imports "$DST/scripts"
fi

echo ""
echo "=== tests/basic/ ==="
mkdir -p "$DST/tests/basic"
for f in "${VISION_TESTS[@]}"; do
  if [[ -f "$SRC/tests/basic/$f" ]]; then
    "${RSYNC[@]}" "$SRC/tests/basic/$f" "$DST/tests/basic/$f"
  fi
done
if $APPLY; then
  rename_imports "$DST/tests/basic"
fi

echo ""
echo "=== Done ==="
if ! $APPLY; then
  echo "Re-run with: $0 --apply"
  echo "For full package copy: $0 --apply --full-tree"
fi
echo ""
echo "Manual follow-up on bright-vision-core (see docs/BRIGHT_VISION_PIVOT.md):"
echo "  1. Fix imports: bright_vision_core modules must call cecli.* not old aider paths"
echo "  2. pyproject.toml: package bright_vision_core, scripts bright-vision-core-serve"
echo "  3. Merge git_workspace / session with cecli main + coders"
echo "  4. pytest tests/basic/test_http_api.py"
echo "  5. Pin submodule SHA in outer repo; point activate.sh at bright-vision-core"
