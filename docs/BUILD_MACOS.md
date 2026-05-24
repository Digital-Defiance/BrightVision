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

Shortcut:

```bash
yarn build:mac
```

## Code signing (Developer ID)

You need a **Developer ID Application** certificate in Keychain.

### Option A — environment variables (CI-friendly)

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_TEAM_ID="TEAMID"   # for notarization

yarn tauri build --target universal-apple-darwin --bundles dmg
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
  "src-tauri/target/universal-apple-darwin/release/bundle/macos/Aider Vision.app"
```

Then rebuild the DMG or use `create-dmg` / Tauri’s bundler after signing.

## Notarization (Gatekeeper)

Signing alone is not enough for distribution outside the Mac App Store. After signing:

```bash
xcrun notarytool submit "path/to/Aider Vision.dmg" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

xcrun stapler staple "path/to/Aider Vision.dmg"
```

Tauri can automate this when `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` are set during build — see the same signing doc.

## Notes for Aider Vision

- The DMG is the **Tauri shell** only. The app still expects **Python + `aider-vision-core`** on the user machine (or a future bundled runtime).
- `targets: "all"` in `tauri.conf.json` also builds `.app` and other formats; use `--bundles dmg` for DMG-only.
