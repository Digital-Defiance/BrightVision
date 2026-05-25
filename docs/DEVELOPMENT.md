# Developing Bright Vision

Product backlog and priorities: [ROADMAP.md](./ROADMAP.md) — agents maintain and follow it until the open backlog is complete.

**Project site:** [bright-vision.digitaldefiance.org](https://bright-vision.digitaldefiance.org) — static landing page in `docs/index.html`, deployed via [GitHub Pages](../.github/workflows/pages.yml) on pushes to `main` under `docs/`.

## Prerequisites

- Node 18+ and Yarn
- Rust toolchain (for Tauri)
- Python 3.10+ with `bright-vision-core` installed editable (`source activate.sh`)
- **LLM:** local [Ollama](https://ollama.com/) recommended — see [LOCAL_LLM.md](./LOCAL_LLM.md)

## First-time setup

```bash
git submodule update --init --recursive bright-vision-core
source activate.sh   # venv + pip install -e bright-vision-core + uvicorn
yarn install
```

**Optional `local-llm.env`:** `cp local-llm.env.example local-llm.env` at repo root (`DATA_MODEL`, `OLLAMA_HOST`). In-app **Local LLM** uses Rust; sessions use Python core — not `local-llm.sh`. See [LOCAL_LLM.md](./LOCAL_LLM.md). Core PyPI release: [bright-vision-core/docs/PUBLISHING.md](../bright-vision-core/docs/PUBLISHING.md).

## After a core PyPI release

See [bright-vision-core/docs/PUBLISHING.md](../bright-vision-core/docs/PUBLISHING.md). Pin the parent Bright Vision app:

```bash
cd bright-vision-core
./build.sh v0.100.1 --sync-vision
./scripts/sync_bright_vision.sh v0.100.1 --commit
```

Updates `requirements-core.txt`, checks out the submodule tag, and installs into the parent `.venv`. PyPI mode: `AIDER_VISION_CORE_INSTALL=pypi source activate.sh`

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
| `src/assets/fonts/Glass_TTY_VT220.woff2` | Glass TTY VT220 for SVG text (commit to repo) |
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
