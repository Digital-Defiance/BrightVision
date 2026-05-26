#!/usr/bin/env bash
# Universal signed + notarized macOS DMG (bash 3.2+ / macOS default bash).
# Prompts for any missing Apple signing / notarization environment variables.
#
# Usage:
#   bash scripts/build-macos.sh
#   bash scripts/build-macos.sh 0.2.0
#   bash scripts/build-macos.sh --version 0.2.0
#   bash scripts/build-macos.sh --skip-notarize 0.1.0
#   bash scripts/build-macos.sh 0.2.0 --publish --push-tap
#   NONINTERACTIVE=1 bash scripts/build-macos.sh 0.1.0 --publish
#
# DMG + GitHub release asset: BrightVision_<version>_universal.dmg (tauri.conf.json productName)

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_NOTARIZE=0
EXTRA_TAURI_ARGS=""
APP_VERSION=""
PUBLISH=0
PUSH_TAP=0
PUSH_GIT_TAG=1
RELEASE_TAG=""
GITHUB_REPO="${GITHUB_REPO:-Digital-Defiance/bright-vision}"
HOMEBREW_TAP_DIR="${HOMEBREW_TAP_DIR:-${HOME}/Code/homebrew-tap}"

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/build-macos.sh [OPTIONS] [VERSION] [-- extra tauri build args...]

  VERSION          Semver for the bundle (default: package.json "version").
                   Writes package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml.
                   Output: src-tauri/target/universal-apple-darwin/release/bundle/dmg/
                           BrightVision_<VERSION>_universal.dmg

  --version VER    Same as positional VERSION (v0.1.0 accepted; leading v is stripped)
  --release-tag TAG
                   Git tag for GitHub release (default: v<VERSION>, e.g. v0.2.0)
  --publish        Create GitHub release, upload DMG, update homebrew-tap cask
  --push-tap       After --publish, commit and push ~/Code/homebrew-tap (implies --publish)
  --no-push-tag    Do not create/push a git tag before gh release (tag must exist)

Environment (set before build or enter when prompted):

  Signing
    APPLE_SIGNING_IDENTITY   Developer ID Application: … (TEAMID)

  Notarization (pick one method)
    APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID
    APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_KEY_PATH

  Publish (--publish)
    gh                  GitHub CLI (gh auth login)
    GITHUB_REPO         default Digital-Defiance/bright-vision
    HOMEBREW_TAP_DIR    default ~/Code/homebrew-tap
EOF
  exit 1
}

looks_like_version() {
  case "$1" in
    v[0-9]*.[0-9]*.[0-9]**) return 0 ;;
    [0-9]*.[0-9]*.[0-9]**) return 0 ;;
    *) return 1 ;;
  esac
}

normalize_version() {
  printf '%s' "$1" | sed 's/^v//'
}

read_version_from_package_json() {
  if [ ! -f "${ROOT}/package.json" ]; then
    return 1
  fi
  node -e "const p=require('./package.json'); if(p.version) process.stdout.write(String(p.version));" 2>/dev/null
}

apply_app_version() {
  _ver="$1"
  if [ -z "$_ver" ]; then
    die "empty version"
  fi
  if ! looks_like_version "$_ver" && ! looks_like_version "v${_ver}"; then
    die "invalid semver: ${_ver} (expected e.g. 0.1.0 or v0.1.0)"
  fi
  _ver="$(normalize_version "$_ver")"
  command -v node >/dev/null 2>&1 || die "node is required to set app version"

  echo "Setting app version to ${_ver} (package.json, tauri.conf.json, Cargo.toml)..." >&2
  node -e "
    const fs = require('fs');
    const ver = process.argv[1];
    for (const rel of ['package.json', 'src-tauri/tauri.conf.json']) {
      const p = require('path').join(process.cwd(), rel);
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      j.version = ver;
      fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    }
  " "$_ver" || die "failed to update JSON version files"

  _cargo="${ROOT}/src-tauri/Cargo.toml"
  if [ ! -f "$_cargo" ]; then
    die "missing ${_cargo}"
  fi
  sed -i '' "s/^version = \".*\"/version = \"${_ver}\"/" "$_cargo" || die "failed to update Cargo.toml"

  APP_VERSION="$_ver"
  export APP_VERSION
}

resolve_app_version() {
  if [ -n "${APP_VERSION:-}" ]; then
    APP_VERSION="$(normalize_version "$APP_VERSION")"
    return 0
  fi
  _from_pkg="$(read_version_from_package_json || true)"
  if [ -n "$_from_pkg" ]; then
    APP_VERSION="$(normalize_version "$_from_pkg")"
    return 0
  fi
  die "could not determine version; pass 0.1.0 or set package.json version"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-notarize) SKIP_NOTARIZE=1; shift ;;
    --publish) PUBLISH=1; shift ;;
    --push-tap) PUBLISH=1; PUSH_TAP=1; shift ;;
    --no-push-tag) PUSH_GIT_TAG=0; shift ;;
    --release-tag)
      shift
      [ -n "${1:-}" ] || die "--release-tag requires a value"
      RELEASE_TAG="$1"
      shift
      ;;
    --version)
      shift
      [ -n "${1:-}" ] || die "--version requires a value"
      APP_VERSION="$(normalize_version "$1")"
      shift
      ;;
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
      if [ -z "${APP_VERSION:-}" ] && looks_like_version "$1"; then
        APP_VERSION="$(normalize_version "$1")"
        shift
      else
        EXTRA_TAURI_ARGS="${EXTRA_TAURI_ARGS} $1"
        shift
      fi
      ;;
  esac
done

resolve_app_version
apply_app_version "$APP_VERSION"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "error: macOS release build must run on macOS" >&2
  exit 1
fi

if [ -z "${BASH_VERSION:-}" ]; then
  echo "error: run with bash, not sh: bash scripts/build-macos.sh" >&2
  exit 1
fi

release_tag_name() {
  if [ -n "${RELEASE_TAG:-}" ]; then
    case "$RELEASE_TAG" in
      v*) printf '%s' "$RELEASE_TAG" ;;
      *) printf 'v%s' "$RELEASE_TAG" ;;
    esac
    return 0
  fi
  printf 'v%s' "$APP_VERSION"
}

dmg_asset_basename() {
  printf 'BrightVision_%s_universal.dmg' "$APP_VERSION"
}

find_built_dmg() {
  _dir="${ROOT}/src-tauri/target/universal-apple-darwin/release/bundle/dmg"
  _expected="${_dir}/BrightVision_${APP_VERSION}_universal.dmg"
  if [ -f "$_expected" ]; then
    printf '%s' "$_expected"
    return 0
  fi
  _newest="$(ls -1t "${_dir}"/*.dmg 2>/dev/null | head -1)"
  if [ -n "$_newest" ] && [ -f "$_newest" ]; then
    printf '%s' "$_newest"
    return 0
  fi
  return 1
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

ensure_git_release_tag() {
  _tag="$(release_tag_name)"
  if git rev-parse "$_tag" >/dev/null 2>&1; then
    echo "Git tag ${_tag} exists locally." >&2
  else
    if is_interactive && [ "${NONINTERACTIVE:-}" != "1" ]; then
      printf "Create git tag %s on HEAD? [y/N] " "$_tag"
      read -r _ans
      _ans="$(printf '%s' "${_ans:-N}" | tr '[:upper:]' '[:lower:]')"
      case "$_ans" in
        y|yes) ;;
        *) die "aborted — create tag ${_tag} or pass --no-push-tag if it exists on remote" ;;
      esac
    fi
    git tag "$_tag"
    echo "Created tag ${_tag}." >&2
  fi

  if [ "$PUSH_GIT_TAG" -eq 1 ]; then
    echo "Pushing ${_tag} to origin..." >&2
    git push origin "$_tag"
  fi
}

publish_github_and_homebrew() {
  _src_dmg="$(find_built_dmg)" || die "DMG not found under src-tauri/target/.../bundle/dmg/"
  command -v gh >/dev/null 2>&1 || die "gh CLI not found (brew install gh && gh auth login)"

  _tag="$(release_tag_name)"
  _asset_name="$(dmg_asset_basename)"
  if [ "$(basename "$_src_dmg")" = "$_asset_name" ]; then
    _staging="$_src_dmg"
  else
    _staging="${ROOT}/src-tauri/target/universal-apple-darwin/release/bundle/dmg/${_asset_name}"
    cp -f "$_src_dmg" "$_staging"
  fi

  _sha="$(sha256_file "$_staging")"
  echo "DMG: ${_staging}" >&2
  echo "sha256: ${_sha}" >&2
  echo "Release tag: ${_tag}" >&2

  if [ "$PUSH_GIT_TAG" -eq 1 ]; then
    ensure_git_release_tag
  elif ! gh release view "$_tag" --repo "$GITHUB_REPO" >/dev/null 2>&1; then
    die "GitHub release ${_tag} missing; create tag or omit --no-push-tag"
  fi

  _title="BrightVision ${APP_VERSION}"
  if gh release view "$_tag" --repo "$GITHUB_REPO" >/dev/null 2>&1; then
    echo "Uploading to existing release ${_tag}..." >&2
    gh release upload "$_tag" "$_staging" --repo "$GITHUB_REPO" --clobber
  else
    echo "Creating GitHub release ${_tag}..." >&2
    gh release create "$_tag" "$_staging" \
      --repo "$GITHUB_REPO" \
      --title "$_title" \
      --generate-notes
  fi

  _release_url="https://github.com/${GITHUB_REPO}/releases/download/${_tag}/${_asset_name}"
  echo "Release asset: ${_release_url}" >&2

  bash "${ROOT}/scripts/update-bright-vision-cask.sh" "$APP_VERSION" "$_sha"

  if [ "$PUSH_TAP" -eq 1 ]; then
    _cask="${HOMEBREW_TAP_DIR}/Casks/bright-vision.rb"
    if [ ! -d "${HOMEBREW_TAP_DIR}/.git" ]; then
      die "not a git repo: ${HOMEBREW_TAP_DIR}"
    fi
    (
      cd "$HOMEBREW_TAP_DIR"
      git add "Casks/bright-vision.rb"
      if git diff --cached --quiet; then
        echo "homebrew-tap: no cask changes to commit." >&2
      else
        _msg="bright-vision ${APP_VERSION}"
        if is_interactive && [ "${NONINTERACTIVE:-}" != "1" ]; then
          git commit -m "$_msg"
          printf "Push homebrew-tap to origin? [y/N] "
          read -r _push_ans
          _push_ans="$(printf '%s' "${_push_ans:-N}" | tr '[:upper:]' '[:lower:]')"
          case "$_push_ans" in
            y|yes) git push origin HEAD ;;
            *) echo "Skipped push. Commit is local in ${HOMEBREW_TAP_DIR}" >&2 ;;
          esac
        else
          git commit -m "$_msg"
          git push origin HEAD
        fi
      fi
    )
  else
    echo "homebrew-tap updated locally. Commit with:" >&2
    echo "  cd ${HOMEBREW_TAP_DIR} && git add Casks/bright-vision.rb && git commit -m 'bright-vision ${APP_VERSION}' && git push" >&2
  fi
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
  echo "  APP_VERSION=${APP_VERSION}" >&2
  echo "  Expected DMG: BrightVision_${APP_VERSION}_universal.dmg" >&2
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
  if [ "$PUBLISH" -eq 1 ]; then
    echo "  Publish: GitHub ${GITHUB_REPO} tag $(release_tag_name)" >&2
    echo "  Homebrew tap: ${HOMEBREW_TAP_DIR}/Casks/bright-vision.rb" >&2
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

_DMG_DIR="${ROOT}/src-tauri/target/universal-apple-darwin/release/bundle/dmg"
echo "Done. DMG under ${_DMG_DIR}/"
if [ -d "$_DMG_DIR" ]; then
  _expected="BrightVision_${APP_VERSION}_universal.dmg"
  if [ -f "${_DMG_DIR}/${_expected}" ]; then
    echo "  ${_DMG_DIR}/${_expected}"
  else
    echo "  (newest .dmg:)"
    ls -1t "${_DMG_DIR}"/*.dmg 2>/dev/null | head -3 || true
  fi
fi

if [ "$PUBLISH" -eq 1 ]; then
  echo ""
  echo "Publishing GitHub release and updating homebrew-tap..." >&2
  publish_github_and_homebrew
fi
