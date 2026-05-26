#!/usr/bin/env bash
# Universal signed + notarized macOS DMG (bash 3.2+ / macOS default bash).
# Prompts for any missing Apple signing / notarization environment variables.
#
# Usage:
#   bash scripts/build-macos.sh
#   bash scripts/build-macos.sh --skip-notarize
#   NONINTERACTIVE=1 bash scripts/build-macos.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_NOTARIZE=0
EXTRA_TAURI_ARGS=""

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/build-macos.sh [--skip-notarize] [-- extra tauri build args...]

Environment (set before build or enter when prompted):

  Signing
    APPLE_SIGNING_IDENTITY   Developer ID Application: … (TEAMID)

  Notarization (pick one method)
    APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID
    APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_KEY_PATH
EOF
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-notarize) SKIP_NOTARIZE=1; shift ;;
    -h|--help) usage ;;
    --)
      shift
      while [ $# -gt 0 ]; do
        EXTRA_TAURI_ARGS="${EXTRA_TAURI_ARGS} $1"
        shift
      done
      break
      ;;
    *)
      EXTRA_TAURI_ARGS="${EXTRA_TAURI_ARGS} $1"
      shift
      ;;
  esac
done

if [ "$(uname -s)" != "Darwin" ]; then
  echo "error: macOS release build must run on macOS" >&2
  exit 1
fi

if [ -z "${BASH_VERSION:-}" ]; then
  echo "error: run with bash, not sh: bash scripts/build-macos.sh" >&2
  exit 1
fi

die() {
  echo "error: $*" >&2
  exit 1
}

is_interactive() {
  [ -z "${CI:-}" ] && [ "${NONINTERACTIVE:-}" != "1" ]
}

prompt_nonempty() {
  var_name="$1"
  prompt_text="$2"
  secret="${3:-0}"
  value=""
  while [ -z "$value" ]; do
    if [ "$secret" = "1" ]; then
      read -r -s -p "${prompt_text}: " value
      echo "" >&2
    else
      read -r -p "${prompt_text}: " value
    fi
    value="$(printf '%s' "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  done
  eval "$var_name=\$value"
  export "$var_name"
}

infer_team_from_signing_identity() {
  if [ -z "${APPLE_TEAM_ID:-}" ] && [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
    _team="$(printf '%s' "$APPLE_SIGNING_IDENTITY" | sed -n 's/.*(\([A-Z0-9][A-Z0-9]*\)).*/\1/p' | head -1)"
    if [ -n "$_team" ]; then
      APPLE_TEAM_ID="$_team"
      export APPLE_TEAM_ID
      echo "APPLE_TEAM_ID: inferred ${APPLE_TEAM_ID} from signing identity." >&2
    fi
  fi
}

list_developer_id_identities() {
  security find-identity -v -p codesigning 2>/dev/null \
    | sed -n 's/^[[:space:]]*[0-9]*[[:space:]]*"\(Developer ID Application:[^"]*\)".*/\1/p'
}

ensure_signing_identity() {
  if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
    infer_team_from_signing_identity
    echo "Signing: ${APPLE_SIGNING_IDENTITY}" >&2
    return 0
  fi

  _tmp="$(mktemp -t bv-sign.XXXXXX)"
  list_developer_id_identities > "$_tmp"
  _count=0
  _single=""
  while IFS= read -r _line; do
    [ -z "$_line" ] && continue
    _count=$((_count + 1))
    _single="$_line"
  done < "$_tmp"
  rm -f "$_tmp"

  if [ "$_count" -eq 1 ]; then
    APPLE_SIGNING_IDENTITY="$_single"
    export APPLE_SIGNING_IDENTITY
    infer_team_from_signing_identity
    echo "Signing: auto-selected ${APPLE_SIGNING_IDENTITY}" >&2
    return 0
  fi

  if [ "$_count" -gt 1 ]; then
    echo "warning: multiple Developer ID Application identities; set APPLE_SIGNING_IDENTITY." >&2
    list_developer_id_identities | while IFS= read -r _line; do
      [ -n "$_line" ] && echo "  - ${_line}" >&2
    done
  else
    echo "warning: no Developer ID Application identity in keychain." >&2
  fi

  if ! is_interactive; then
    die "APPLE_SIGNING_IDENTITY is not set"
  fi

  prompt_nonempty APPLE_SIGNING_IDENTITY "APPLE_SIGNING_IDENTITY"
  infer_team_from_signing_identity
  echo "Signing: ${APPLE_SIGNING_IDENTITY}" >&2
}

has_notary_api_key() {
  [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ] && [ -n "${APPLE_API_KEY_PATH:-}" ]
}

has_notary_password() {
  [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]
}

missing_notary_api_vars() {
  _m=""
  [ -n "${APPLE_API_KEY:-}" ] || _m="${_m}APPLE_API_KEY
"
  [ -n "${APPLE_API_ISSUER:-}" ] || _m="${_m}APPLE_API_ISSUER
"
  [ -n "${APPLE_API_KEY_PATH:-}" ] || _m="${_m}APPLE_API_KEY_PATH
"
  [ -z "$_m" ] && return 1
  printf '%s' "$_m"
}

missing_notary_password_vars() {
  _m=""
  [ -n "${APPLE_ID:-}" ] || _m="${_m}APPLE_ID
"
  [ -n "${APPLE_PASSWORD:-}" ] || _m="${_m}APPLE_PASSWORD
"
  [ -n "${APPLE_TEAM_ID:-}" ] || _m="${_m}APPLE_TEAM_ID
"
  [ -z "$_m" ] && return 1
  printf '%s' "$_m"
}

prompt_notary_api_vars() {
  _missing="$(missing_notary_api_vars 2>/dev/null || true)"
  [ -n "$_missing" ] || return 0

  echo "" >&2
  echo "App Store Connect API notarization — missing:" >&2
  printf '%s' "$_missing" | sed 's/^/  /' >&2

  if ! is_interactive; then
    die "set APPLE_API_KEY, APPLE_API_ISSUER, and APPLE_API_KEY_PATH"
  fi

  [ -n "${APPLE_API_ISSUER:-}" ] || prompt_nonempty APPLE_API_ISSUER "APPLE_API_ISSUER"
  [ -n "${APPLE_API_KEY:-}" ] || prompt_nonempty APPLE_API_KEY "APPLE_API_KEY"
  [ -n "${APPLE_API_KEY_PATH:-}" ] || prompt_nonempty APPLE_API_KEY_PATH "APPLE_API_KEY_PATH"
  [ -f "${APPLE_API_KEY_PATH}" ] || die "APPLE_API_KEY_PATH not found: ${APPLE_API_KEY_PATH}"

  has_notary_api_key || die "notarization API credentials incomplete"
  echo "Notarization: API key ready." >&2
}

prompt_notary_password_vars() {
  _missing="$(missing_notary_password_vars 2>/dev/null || true)"
  [ -n "$_missing" ] || return 0

  echo "" >&2
  echo "Apple ID notarization — missing:" >&2
  printf '%s' "$_missing" | sed 's/^/  /' >&2
  echo "APPLE_PASSWORD = app-specific password (https://appleid.apple.com)" >&2

  if ! is_interactive; then
    die "set APPLE_ID, APPLE_PASSWORD, and APPLE_TEAM_ID"
  fi

  infer_team_from_signing_identity
  [ -n "${APPLE_ID:-}" ] || prompt_nonempty APPLE_ID "APPLE_ID"
  [ -n "${APPLE_TEAM_ID:-}" ] || prompt_nonempty APPLE_TEAM_ID "APPLE_TEAM_ID"
  [ -n "${APPLE_PASSWORD:-}" ] || prompt_nonempty APPLE_PASSWORD "APPLE_PASSWORD" 1

  has_notary_password || die "notarization credentials incomplete"
  echo "Notarization: ${APPLE_ID} team ${APPLE_TEAM_ID} (password set)." >&2
}

ensure_notarization() {
  if [ "$SKIP_NOTARIZE" -eq 1 ]; then
    echo "warning: --skip-notarize — signed only, not notarized." >&2
    return 0
  fi

  if has_notary_api_key; then
    echo "Notarization: API key ready." >&2
    return 0
  fi

  if has_notary_password; then
    echo "Notarization: Apple ID flow ready." >&2
    return 0
  fi

  _pwd_missing="$(missing_notary_password_vars 2>/dev/null || true)"
  _api_missing="$(missing_notary_api_vars 2>/dev/null || true)"

  if [ -n "$_api_missing" ] && [ -z "$_pwd_missing" ]; then
    prompt_notary_api_vars
    return 0
  fi

  if [ -n "$_pwd_missing" ] && [ -z "$_api_missing" ]; then
    prompt_notary_password_vars
    return 0
  fi

  echo "" >&2
  echo "warning: Notarization not fully configured (Tauri will skip notarization)." >&2
  [ -n "$_pwd_missing" ] && printf '%s' "$_pwd_missing" | sed 's/^/  missing: /' >&2
  [ -n "$_api_missing" ] && printf '%s' "$_api_missing" | sed 's/^/  missing: /' >&2

  if ! is_interactive; then
    die "notarization credentials missing"
  fi

  printf "Use App Store Connect API key? [y/N] "
  read -r _use_api
  _use_api="$(printf '%s' "${_use_api:-N}" | tr '[:upper:]' '[:lower:]')"
  case "$_use_api" in
    y|yes) prompt_notary_api_vars ;;
    *) prompt_notary_password_vars ;;
  esac
}

print_release_env_summary() {
  echo "" >&2
  echo "Release environment:" >&2
  echo "  APPLE_SIGNING_IDENTITY=${APPLE_SIGNING_IDENTITY:-<not set>}" >&2
  if [ "$SKIP_NOTARIZE" -eq 1 ]; then
    echo "  Notarization: skipped" >&2
  elif has_notary_api_key; then
    echo "  Notarization: API ${APPLE_API_KEY}" >&2
  elif has_notary_password; then
    echo "  Notarization: ${APPLE_ID} team ${APPLE_TEAM_ID}" >&2
  else
    echo "  Notarization: incomplete" >&2
  fi
}

ensure_signing_identity
ensure_notarization
print_release_env_summary

echo "Building frontend..."
yarn build

echo "Building universal DMG (Tauri)..."
# shellcheck disable=SC2086
yarn tauri build --target universal-apple-darwin --bundles dmg ${EXTRA_TAURI_ARGS}

echo "Done. DMG under src-tauri/target/universal-apple-darwin/release/bundle/dmg/"
