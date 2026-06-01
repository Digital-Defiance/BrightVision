#!/usr/bin/env bash
# Install bgpucap for Test Lab / yarn test:everything (optional but recommended on Apple Silicon).
#
# Does NOT vendor Rust sources into bright_vision_core — installs a pinned binary to:
#   .bright-vision/bin/bgpucap
#
# Sources (first match):
#   1. BV_GPUCAP_SRC or third-party/gpucap submodule / sibling clone
#   2. cargo install gpucap --version (pinned below)
#
# Prefer Homebrew when available: brew install digital-defiance/tap/gpucap (0.1.4+).
# Usage: source activate.sh && sh scripts/install-bgpucap.sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GPUCAP_VERSION="${BV_GPUCAP_VERSION:-0.1.4}"
INSTALL_ROOT="${ROOT}/.bright-vision/cargo-bgpucap"
BIN_DIR="${ROOT}/.bright-vision/bin"
mkdir -p "$BIN_DIR"

pick_src() {
  if [ -n "${BV_GPUCAP_SRC:-}" ] && [ -f "${BV_GPUCAP_SRC}/Cargo.toml" ]; then
    echo "${BV_GPUCAP_SRC}"
    return 0
  fi
  for candidate in \
    "${ROOT}/third-party/gpucap" \
    "${ROOT}/../gpucap" \
    "${HOME}/Code/gpucap"; do
    if [ -f "${candidate}/Cargo.toml" ]; then
      echo "${candidate}"
      return 0
    fi
  done
  return 1
}

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found — install Rust (https://rustup.rs) or: brew install gpucap" >&2
  exit 1
fi

if SRC="$(pick_src)"; then
  echo "install-bgpucap: building from ${SRC} → ${BIN_DIR}/bgpucap" >&2
  cargo install --path "${SRC}" --root "${INSTALL_ROOT}" --locked --force
else
  echo "install-bgpucap: cargo install gpucap ${GPUCAP_VERSION} → ${INSTALL_ROOT}" >&2
  cargo install gpucap --version "${GPUCAP_VERSION}" --root "${INSTALL_ROOT}" --locked --force
fi

install -m 755 "${INSTALL_ROOT}/bin/bgpucap" "${BIN_DIR}/bgpucap"
ln -sf bgpucap "${BIN_DIR}/gpucap" 2>/dev/null || true

echo "Installed: ${BIN_DIR}/bgpucap ($("${BIN_DIR}/bgpucap" --version 2>/dev/null || echo unknown))"
echo "Test Lab / test:everything will prefer this path automatically."
