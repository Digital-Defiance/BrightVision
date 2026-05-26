#!/usr/bin/env bash
# Update digital-defiance/homebrew-tap Casks/bright-vision.rb (version + sha256).
#
# Cask token stays bright-vision; DMG/app binary use BrightVision (trademark).
#
# Usage:
#   bash scripts/update-bright-vision-cask.sh 0.2.0 <sha256>
#   HOMEBREW_TAP_DIR=~/Code/homebrew-tap bash scripts/update-bright-vision-cask.sh 0.2.0 <sha256>

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-}"
SHA256="${2:-}"
HOMEBREW_TAP_DIR="${HOMEBREW_TAP_DIR:-${HOME}/Code/homebrew-tap}"
GITHUB_REPO="${GITHUB_REPO:-Digital-Defiance/bright-vision}"
CASK_PATH="${CASK_PATH:-${HOMEBREW_TAP_DIR}/Casks/bright-vision.rb}"
DMG_ASSET='BrightVision_#{version}_universal.dmg'
APP_BUNDLE='BrightVision.app'

die() {
  echo "error: $*" >&2
  exit 1
}

[[ -n "$VERSION" ]] || die "usage: $0 <version> <sha256>  (e.g. 0.2.0 abc123...)"
[[ -n "$SHA256" ]] || die "missing sha256"
[[ -f "$CASK_PATH" ]] || die "cask not found: ${CASK_PATH}"

# Normalize tag-style versions for the cask (no leading v).
VERSION="$(printf '%s' "$VERSION" | sed 's/^v//')"

if [ "$(uname -s)" = "Darwin" ]; then
  SED_INPLACE=(sed -i '')
else
  SED_INPLACE=(sed -i)
fi

"${SED_INPLACE[@]}" "s/^  version .*/  version \"${VERSION}\"/" "$CASK_PATH"
"${SED_INPLACE[@]}" "s/^  sha256 .*/  sha256 \"${SHA256}\"/" "$CASK_PATH"

# Universal DMG — do not restrict to Apple Silicon only.
"${SED_INPLACE[@]}" '/depends_on arch: :arm64/d' "$CASK_PATH"

# Release asset + installed app bundle (migrate legacy Bright.Vision / spaced names).
"${SED_INPLACE[@]}" 's/Bright\.Vision_#{version}_universal\.dmg/BrightVision_#{version}_universal.dmg/g' "$CASK_PATH"
"${SED_INPLACE[@]}" 's/Bright Vision_#{version}_universal\.dmg/BrightVision_#{version}_universal.dmg/g' "$CASK_PATH"
"${SED_INPLACE[@]}" "s|^  url .*|  url \"https://github.com/${GITHUB_REPO}/releases/download/v#{version}/${DMG_ASSET}\"|" "$CASK_PATH"

"${SED_INPLACE[@]}" 's/app "Aider Vision\.app"/app "'"${APP_BUNDLE}"'"/g' "$CASK_PATH"
"${SED_INPLACE[@]}" 's/app "Bright Vision\.app"/app "'"${APP_BUNDLE}"'"/g' "$CASK_PATH"
"${SED_INPLACE[@]}" 's/app "Bright\.Vision\.app"/app "'"${APP_BUNDLE}"'"/g' "$CASK_PATH"
if ! grep -q "app \"${APP_BUNDLE}\"" "$CASK_PATH"; then
  "${SED_INPLACE[@]}" 's/^  app .*/  app "'"${APP_BUNDLE}"'"/' "$CASK_PATH"
fi

echo "Updated ${CASK_PATH}"
echo "  version ${VERSION}"
echo "  sha256 ${SHA256}"
echo "  dmg ${DMG_ASSET}"
echo "  app ${APP_BUNDLE}"
