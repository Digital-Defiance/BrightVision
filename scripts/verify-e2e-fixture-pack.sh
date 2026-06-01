#!/usr/bin/env sh
# Validate external e2e fixture-pack structure for LLM/integration suites.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
DEFAULT_SUBMODULE_PACK="${ROOT}/e2e/fixture-pack"
DEFAULT_INREPO_PACK="${ROOT}/e2e/fixtures"

resolve_real_dir() {
  target="$1"
  test -d "$target" || return 1
  (
    cd "$target"
    pwd -P
  )
}

if [ -n "${1:-}" ]; then
  PACK_ROOT_RAW="$1"
elif [ -n "${E2E_FIXTURE_PACK_ROOT:-}" ]; then
  PACK_ROOT_RAW="${E2E_FIXTURE_PACK_ROOT}"
elif [ -d "$DEFAULT_SUBMODULE_PACK" ]; then
  PACK_ROOT_RAW="$DEFAULT_SUBMODULE_PACK"
else
  PACK_ROOT_RAW="$DEFAULT_INREPO_PACK"
fi

fail() {
  echo "fixture-pack-check: $*" >&2
  exit 1
}

note() {
  printf '%s\n' "$1"
}

check_repo() {
  name="$1"
  must_have="$2"
  dir="${PACK_ROOT}/${name}"
  test -d "$dir" || fail "missing workspace directory: ${name} (${dir})"
  test -f "${dir}/${must_have}" || fail "${name} missing required file: ${must_have}"
  if [ -d "${dir}/.git" ]; then
    note "PASS ${name} (standalone git repo)"
  else
    note "PASS ${name} (directory fixture)"
  fi
}

note "== Fixture pack root =="
test -d "$PACK_ROOT_RAW" || fail "pack root does not exist: ${PACK_ROOT_RAW}"
PACK_ROOT="$(resolve_real_dir "$PACK_ROOT_RAW")" || fail "cannot resolve realpath for: ${PACK_ROOT_RAW}"
note "$PACK_ROOT"

note ""
note "== Required workspaces =="
check_repo "hello-workspace" "README.md"
check_repo "context-workspace" "src/e2e_widget.ts"
check_repo "tasks-seeded-workspace" ".cecli/todos.json"
check_repo "edit-block-workspace" "src/patchme.ts"

note ""
note "== Optional submodule pin check =="
if [ -f "${ROOT}/.gitmodules" ]; then
  rel="$(python3 - <<'PY' "$ROOT" "$PACK_ROOT"
import os, sys
root = os.path.realpath(sys.argv[1])
pack = os.path.realpath(sys.argv[2])
if pack.startswith(root + os.sep):
    print(os.path.relpath(pack, root))
PY
)"
  if [ -n "$rel" ] && [ "$rel" != "." ]; then
    if git -C "$ROOT" config --file .gitmodules --get-regexp "^submodule\\..*\\.path$" 2>/dev/null | awk '{print $2}' | rg -x --fixed-strings "$rel" >/dev/null 2>&1; then
      status="$(git -C "$ROOT" submodule status -- "$rel" 2>/dev/null || true)"
      if [ -n "$status" ]; then
        note "PASS submodule pinned: $status"
      else
        note "WARN pack path appears in .gitmodules but submodule status was empty (${rel})"
      fi
    else
      note "INFO pack root is inside repo but not a declared submodule: ${rel}"
    fi
  else
    note "INFO pack root is outside superproject; skipping submodule pin check"
  fi
else
  note "INFO no .gitmodules found; skipping submodule pin check"
fi

note ""
note "Fixture pack check OK."
