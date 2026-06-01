# macOS release build (universal DMG + signing)

DMG and `.app` bundles **must be built on a Mac** (no cross-compile from Linux).

## Universal binary (Apple Silicon + Intel)

Requires **rustup** with both macOS targets (Homebrew-only `rustc` is not enough for `universal-apple-darwin`).

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
yarn build
yarn tauri build --target universal-apple-darwin --bundles dmg
```

Do **not** put `--` before `--target` / `--bundles`. In Tauri 2, everything after `--` is passed to **cargo**, which causes `unexpected argument '--bundles'`.

Apple Silicon only (Homebrew Rust is fine):

```bash
yarn tauri build --bundles dmg
```

Output (typical):

- `src-tauri/target/universal-apple-darwin/release/bundle/macos/*.app`
- `src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg`

Shortcut (prompts for `APPLE_PASSWORD` if not set — avoids signed-but-not-notarized DMGs):

```bash
yarn build:mac
# release with explicit semver (updates package.json, tauri.conf.json, Cargo.toml):
yarn build:mac 0.2.0
yarn build:mac --version 0.2.0
# sign only, no notarization prompt:
yarn build:mac -- --skip-notarize
```

DMG filename follows Tauri: `BrightVision_<version>_universal.dmg` (from `productName` + `version` in `src-tauri/tauri.conf.json`). Without a version argument, the script uses `package.json` `version` (currently `0.1.0`).

### GitHub release + Homebrew tap

After a successful build, `--publish` uploads the DMG to [Digital-Defiance/BrightVision](https://github.com/Digital-Defiance/BrightVision) and updates `~/Code/homebrew-tap/Casks/brightvision.rb` (`version` + `sha256`).

Requires [GitHub CLI](https://cli.github.com/): `brew install gh && gh auth login`.

```bash
# Build, notarize, create release v0.2.0, upload DMG, update cask
yarn build:mac 0.2.0 --publish

# Also commit and push homebrew-tap (prompts before push unless NONINTERACTIVE=1)
yarn build:mac 0.2.0 --publish --push-tap

# Non-interactive CI-style
NONINTERACTIVE=1 yarn build:mac 0.2.0 --publish --push-tap
```

| Flag | Effect |
|------|--------|
| `--publish` | `gh release create` / upload + update cask |
| `--push-tap` | Commit & push `homebrew-tap` (implies `--publish`) |
| `--release-tag v0.1.0-bright2` | Git tag / release name (default `v<VERSION>`) |
| `--no-push-tag` | Do not create/push git tag (release tag must exist) |

Release asset name: `BrightVision_<version>_universal.dmg` — same as the Tauri DMG and the cask `url`. Homebrew cask token: `brightvision`; the installed app is `BrightVision.app`.

Update cask only (DMG already built):

```bash
bash scripts/update-brightvision-cask.sh 0.2.0 "$(shasum -a 256 'path/to/BrightVision_0.2.0_universal.dmg' | awk '{print $1}')"
```

Reference cask: [scripts/Casks/brightvision.rb.example](../scripts/Casks/brightvision.rb.example)

Environment: `GITHUB_REPO` (default `Digital-Defiance/BrightVision`), `HOMEBREW_TAP_DIR` (default `~/Code/homebrew-tap`).

`scripts/build-macos.sh` checks and prompts for every missing variable before building:

| Purpose | Variables |
|---------|-----------|
| Signing | `APPLE_SIGNING_IDENTITY` (auto-picked if one Developer ID cert in Keychain) |
| Notarization (Apple ID) | `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` |
| Notarization (API) | `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_KEY_PATH` |

`APPLE_TEAM_ID` is inferred from `APPLE_SIGNING_IDENTITY` when it contains `(TEAMID)`.

For CI, export all required vars and set `NONINTERACTIVE=1`.

## Code signing (Developer ID)

You need a **Developer ID Application** certificate in Keychain.

### Option A — environment variables (CI-friendly)

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_TEAM_ID="TEAMID"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # app-specific password (Tauri name)

yarn build:mac
```

For GitHub Actions, use base64 `.p12` — see [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/).

### Option B — `tauri.conf.json`

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAMID)"
    }
  }
}
```

List identities:

```bash
security find-identity -v -p codesigning
```

### Sign an existing `.app` manually

```bash
codesign --force --options runtime --sign "Developer ID Application: …" \
  "src-tauri/target/universal-apple-darwin/release/bundle/macos/BrightVision.app"
```

Then rebuild the DMG or use `create-dmg` / Tauri’s bundler after signing.

## Notarization (Gatekeeper)

Signing alone is not enough for distribution outside the Mac App Store. After signing:

```bash
xcrun notarytool submit "path/to/BrightVision_0.2.0_universal.dmg" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

xcrun stapler staple "path/to/BrightVision_0.2.0_universal.dmg"
```

`yarn build:mac` prompts for these if missing. Tauri notarizes during the build when they are set — see [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/).

### Notarization timeout (`NSURLErrorDomain Code=-1001`)

If the log shows **codesign succeeded** (`replacing existing signature`) but the build fails on:

`failed to notarize app` → `appstoreconnect.apple.com/notary/v2/submissions` → **The request timed out**

that is **Apple’s notary API or your network**, not a signing identity or entitlements problem. It is **not** caused by **BrightVision Test Lab** (`apps/test-lab` is a separate Tauri app and is not bundled into `BrightVision.app`).

**Retry:**

```bash
yarn build:mac 0.2.0 --publish --push-tap
```

**Split sign and notarize** (useful when Apple’s API is slow; Tauri’s inline submit uses a short HTTP timeout):

```bash
yarn build:mac 0.2.0 -- --skip-notarize
_DMG="src-tauri/target/universal-apple-darwin/release/bundle/dmg/BrightVision_0.2.0_universal.dmg"
xcrun notarytool submit "$_DMG" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait
xcrun stapler staple "$_DMG"
# then publish DMG / update cask manually, or re-run with --publish if you add a notarize-only path
```

Check VPN/firewall, [Apple System Status](https://developer.apple.com/system-status/) (Notary Service), and that `APPLE_PASSWORD` is an app-specific password (not your Apple ID login).

## Notes for BrightVision

- The DMG is the **Tauri shell** only. The app still expects **Python + `bright-vision-core`** on the user machine (or a future bundled runtime).
- `targets: "all"` in `tauri.conf.json` also builds `.app` and other formats; use `--bundles dmg` for DMG-only.
