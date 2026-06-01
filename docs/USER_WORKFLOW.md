# User workflow

## What you install

**BrightVision** is the desktop app. The agent stack is **`bright_vision_core`** (Vision HTTP, in this repo) plus **`cecli`** (submodule). You do not install the engine into every project you code on.

## First-time setup (developers)

```bash
git clone https://github.com/Digital-Defiance/BrightVision.git
cd BrightVision
git submodule update --init --recursive cecli
source activate.sh          # pip install -e cecli + bright_vision_core
yarn install
cp local-llm.env.example local-llm.env   # optional but recommended for Ollama
yarn tauri dev
```

On launch, **project** defaults to the app repo. Use Chat welcome or Settings to point at another repo if needed.

**Self-dev on this repo:** [DOGFOOD.md](./DOGFOOD.md).

## Local LLM (recommended)

For local Ollama: set **`local-llm.env`** (`DATA_MODEL`, optional `OLLAMA_HOST`; optional `MODEL_ROUTER`, `FAST_MODEL`, `HEAVY_MODEL` for fast/heavy routing), **Settings → Sync from env files**, then **Terminal → Local LLM → Start** (or enable **Auto before session** and use **Terminal → Start**). Details: [LOCAL_LLM.md](./LOCAL_LLM.md).

## Day-to-day use

1. **Open the app** — project path is auto-detected or restored from last session.
2. **Choose project** (optional) — welcome card or Settings → folder picker. This is the git repo the agent edits.
3. **Settings** (optional) — model (local: `ollama_chat/…`), LiteLLM params, context files → **Save**.
4. **Terminal → Start** — spawns core from the app bundle, opens an HTTP session on your project.
5. **Chat** — send prompts; git activity appears on the Git tab.

## Two paths

| Goal | Project workspace | Engine |
|------|-------------------|--------|
| Hack on BrightVision itself | repo root (superproject) | In-repo `bright_vision_core` + `cecli/` |
| Work on any other repo | That repo’s root (via picker) | Same bundled engine |

## Environment

- `BRIGHT_VISION_ENGINE` — optional absolute path to engine root (must contain `scripts/vision_serve.py`).
- `BRIGHT_VISION_HEADLESS` — set by Tauri when spawning the API child.
- `BRIGHT_VISION_TOKEN` — optional Bearer token for `:8741`.
- `BRIGHT_VISION_PYTHON` — optional interpreter for the core child (defaults to `.venv/bin/python3`).
