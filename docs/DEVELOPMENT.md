# Developing Aider Vision

## Prerequisites

- Node 18+ and Yarn
- Rust toolchain (for Tauri)
- Python 3.10+ with `aider-vision-core` installed editable

## First-time setup

```bash
git submodule update --init --recursive
source activate.sh   # venv + pip install -e aider-vision-core
yarn install
```

## Run the desktop app

From the **superproject root** (e.g. `/Volumes/Code/aider-vision`):

```bash
yarn tauri dev
```

On first launch, **project** defaults to the app repo (`detect_workspace`). The engine is resolved from the app install, not from inside your project. See [USER_WORKFLOW.md](./USER_WORKFLOW.md).

- **Project** — git repo the agent edits (any folder)
- **Context files** — optional paths relative to project

Use **Terminal → Start** to spawn `scripts/vision_serve.py` and open an HTTP session. Chat uses SSE only (no interactive CLI).

## Web-only dev (API already running)

```bash
cd aider-vision-core && python scripts/vision_serve.py --port 8741
yarn dev   # Vite proxies /api/core → :8741
```

Set Vision API URL to `/api/core` in Settings.

## Tauri build

`src-tauri/build.rs` must call `tauri_build::build()` so `generate_context!()` receives `OUT_DIR`. Placeholder icons live under `src-tauri/icons/` (replace with real assets before release).

## Progress UI (React)

Long-running work is surfaced via `ProcessProvider` and `VisionActivityBar` (violet/cyan pulse under the header). Phases are driven from:

- `visionApi` `onPhase` during API boot / session create
- `useAiderSession` for send/stop
- `process.ingestCoreEvent()` for SSE (`token`, `tool_*`, `confirm`, `done`, `error`)

Import from `src/progress` or use `useProcess()` in components.

## Brand assets

| Path | Purpose |
|------|---------|
| `src/assets/brand/*.svg` | Wordmarks (inline in UI when `BRAND_LOGO_MODE === 'vector'`) |
| `src/assets/brand/*.png` | Raster fallbacks |
| `src/assets/fonts/Glass_TTY_VT220.woff2` | Glass TTY VT220 for SVG text (commit to repo) |
| `src/assets/brand/logo.png` | Source for `yarn tauri icon …` → dock/installer icons |

## macOS release DMG

Universal (arm64 + x86_64) signed DMG: [BUILD_MACOS.md](./BUILD_MACOS.md).

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [IPC.md](./IPC.md).
