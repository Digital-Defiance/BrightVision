# Developing BrightVision

Product backlog and priorities: [ROADMAP.md](./ROADMAP.md) — agents maintain and follow it until the open backlog is complete.

**Engine:** [Cecli](https://cecli.dev) in submodule **`cecli/`**, plus **`bright_vision_core/`** in this repo (Vision HTTP; PyPI package `bright-vision-core`). See [UPSTREAM_CECLI.md](./UPSTREAM_CECLI.md).

**Project site:** [bright-vision.digitaldefiance.org](https://bright-vision.digitaldefiance.org) — static landing page in `docs/index.html`, deployed via [GitHub Pages](../.github/workflows/pages.yml) on pushes to `main` under `docs/`.

## Prerequisites

- Node 18+ and Yarn
- Rust toolchain (for Tauri)
- Python 3.10+ (`source activate.sh` installs editable `cecli` + `bright_vision_core`)
- **LLM:** local [Ollama](https://ollama.com/) recommended — see [LOCAL_LLM.md](./LOCAL_LLM.md)

## First-time setup

```bash
git submodule update --init cecli
source activate.sh   # venv + editable cecli + bright_vision_core
yarn install
```

**Optional `local-llm.env`:** `cp local-llm.env.example local-llm.env` at repo root (`DATA_MODEL`, `OLLAMA_HOST`). In-app **Local LLM** uses Rust; chat uses the Vision API — not `local-llm.sh`. See [LOCAL_LLM.md](./LOCAL_LLM.md).

PyPI / release workflow for the Vision wheel: track in [UPSTREAM_CECLI.md](./UPSTREAM_CECLI.md) milestone U3. PyPI-only install: `AIDER_VISION_CORE_INSTALL=pypi source activate.sh`

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
- `useVisionSession` for send/stop
- `process.ingestCoreEvent()` for SSE (`token`, `tool_*`, `confirm`, `done`, `error`)

Import from `src/progress` or use `useProcess()` in components.

## Brand assets

| Path | Purpose |
|------|---------|
| `src/assets/brand/*.svg` | Wordmarks (inline in UI when `BRAND_LOGO_MODE === 'vector'`) |
| `src/assets/brand/*.png` | Raster fallbacks |
| `src/assets/fonts/Inter-Black.woff2`, `Inter-Thin.woff2` | Wordmark text in inline SVG logos |
| `src/assets/fonts/Inter-*.woff2` | UI + chat (copy from `assets/Inter/`; see `src/assets/fonts/README.md`) |
| `src/assets/fonts/Glass_TTY_VT220.woff2` | Optional retro chat font in Settings → Appearance |
| `src/assets/brand/logo.png` | Source for `yarn tauri icon …` → dock/installer icons |

## macOS release DMG

Universal (arm64 + x86_64) signed DMG: [BUILD_MACOS.md](./BUILD_MACOS.md).

## Local testing

Default before you push (no CI required):

```bash
yarn test:local
```

Larger UI/session changes:

```bash
yarn test:full
```

Details and tiers: [TESTING.md](./TESTING.md).

## Compatibility audit

After changing `aider-vision-core`, run:

```bash
python aider-vision-core/scripts/audit_rename_compat.py
pytest aider-vision-core/tests/basic/test_vision_runtime.py -q
```

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for `No module named 'aider'` and headless/TUI issues.

## Submodule verification

```bash
source activate.sh
yarn verify:submodule
```

See [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md).

## Cutting a release

See [RELEASE.md](./RELEASE.md) for commit/tag/bump/verify steps when shipping core + parent together.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [IPC.md](./IPC.md).
