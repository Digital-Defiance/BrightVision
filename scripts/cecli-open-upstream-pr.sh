#!/usr/bin/env bash
# Open a PR from Digital-Defiance/cecli → cecli-dev/cecli.
#
# `gh pr create --head Digital-Defiance:…` fails for org-owned forks (gh/cli#10093).
# This script uses GitHub GraphQL createPullRequest with headRepositoryId instead.
#
# Full workflow (branch, test, cherry-pick, parent pin): docs/CECLI_UPSTREAM_PR.md
#
# Usage:
#   ./scripts/cecli-open-upstream-pr.sh <branch> <title> [body]
#
# Example:
#   ./scripts/cecli-open-upstream-pr.sh pr/edit-text-list-params \
#     "fix(tools): normalize LIST_PARAMS when TRACK_INVOCATIONS is off" \
#     "See docs/CECLI_UPSTREAM_PR.md example."
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CECLI="${ROOT}/cecli"

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage 0
fi

BRANCH="${1:-}"
TITLE="${2:-}"
BODY="${3:-}"

if [ -z "$BRANCH" ] || [ -z "$TITLE" ]; then
  echo "error: branch and title required" >&2
  usage 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI required (https://cli.github.com/)" >&2
  exit 1
fi

if [ ! -e "${CECLI}/.git" ]; then
  echo "error: cecli submodule missing — git submodule update --init cecli" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh not authenticated — run: gh auth login" >&2
  exit 1
fi

if ! git -C "$CECLI" rev-parse --verify "origin/${BRANCH}" >/dev/null 2>&1; then
  echo "error: origin/${BRANCH} not found — push first:" >&2
  echo "  git -C cecli push -u origin ${BRANCH}" >&2
  exit 1
fi

if [ "${CECLI_SKIP_PRE_COMMIT:-}" != "1" ]; then
  echo "Running cecli pre-commit parity (isort/black/flake8)…" >&2
  sh "${ROOT}/scripts/verify-cecli-pre-commit.sh"
else
  echo "skip: CECLI_SKIP_PRE_COMMIT=1" >&2
fi

FORK_ID="$(gh api repos/Digital-Defiance/cecli --jq .node_id)"
UPSTREAM_ID="$(gh api repos/cecli-dev/cecli --jq .node_id)"

echo "Creating PR: cecli-dev/cecli ← Digital-Defiance/cecli:${BRANCH}" >&2

RESULT="$(gh api graphql -f query='
mutation($repoId: ID!, $headRepoId: ID!, $headRef: String!, $baseRef: String!, $title: String!, $body: String!) {
  createPullRequest(input: {
    repositoryId: $repoId
    baseRefName: $baseRef
    headRepositoryId: $headRepoId
    headRefName: $headRef
    title: $title
    body: $body
  }) {
    pullRequest { number url }
  }
}' \
  -f repoId="$UPSTREAM_ID" \
  -f headRepoId="$FORK_ID" \
  -f headRef="$BRANCH" \
  -f baseRef="main" \
  -f title="$TITLE" \
  -f body="$BODY")"

PR_URL="$(echo "$RESULT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["data"]["createPullRequest"]["pullRequest"]["url"])')"
if [ -z "$PR_URL" ]; then
  echo "$RESULT" >&2
  echo "error: could not parse PR URL from GraphQL response" >&2
  exit 1
fi
echo "$PR_URL"
echo "" >&2
echo "Next: cherry-pick to dev-integration — see docs/CECLI_UPSTREAM_PR.md §4" >&2
