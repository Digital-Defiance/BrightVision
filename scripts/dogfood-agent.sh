#!/usr/bin/env sh
# Agent dogfood: validate BrightVision on itself without the desktop GUI.
# See docs/DOGFOOD.md — primary self-dev loop for Cursor/agents and CI.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

printf '%s\n' \
  "BrightVision agent dogfood" \
  "  workspace: superproject root (this repo)" \
  "  engine:    bright-vision-core-serve :8741 (via tests / integration e2e)" \
  "  GUI:       not required" \
  ""

exec sh scripts/dogfood-gate.sh
