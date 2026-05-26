# Local LLM setup (recommended)

BrightVision is **privacy-first**: the default path is a **local** model on your machine via [Ollama](https://ollama.com/), not rented cloud inference.

## Built into the desktop app (no `local-llm.sh`)

BrightVision does **not** shell out to the separate [local-llm](https://github.com/Digital-Defiance/local-llm) repo or `local-llm.sh`. Local inference is built in:

| Layer | What it does |
|-------|----------------|
| **Rust (Tauri)** | **Terminal → Local LLM** — start/stop Ollama, pull model, preload `keep_alive: -1`, ping, refresh |
| **Python (`bright-vision-core`)** | **Terminal → Start** — spawns the headless API; chat turns call Ollama through LiteLLM (`ollama_chat/…`) |

You only need **Ollama** installed plus a small env file (below). Use the in-app **Local LLM** panel or enable **Auto before session** (default).

### What **Start Local LLM** does (Rust)

1. Ensure Ollama is running (starts `ollama serve` on macOS when needed)
2. `ollama pull` your chat model if missing
3. Preload with `keep_alive: -1` when the model is not already in `/api/ps`
4. Refresh `keep_alive` only when the model is already loaded (fast path)

### Dynamic model tiering (#39)

**Settings → Local model router** (Ollama sessions only) classifies each prompt and picks from the **model hopper**: enable one or more **fast** and **heavy** models (switches per row), set tier, reorder priority. Empty heavy id uses your main LLM model. Fast tier uses `keep_alive: 5m`; heavy uses `keep_alive: 0`. Pull tags (`ollama pull …`) and enable **Auto before session** so swaps stay warm.

### What **Start session** does (Python)

1. Optionally runs **Start Local LLM** first (if **Auto before session** is on)
2. Spawns `bright-vision-core-serve` on `http://127.0.0.1:8741`
3. Opens a workspace session; your chat messages hit the core over HTTP/SSE

## Configuration files

Vision loads env keys from these paths (**later files win**). Settings → **local-llm directory** applies last.

1. `~/.config/local-llm/env`
2. `$LOCAL_LLM_DIR/local-llm.env` (if set)
3. `$BRIGHT_VISION_ROOT/local-llm.env` (if set)
4. **`./local-llm.env`** at the BrightVision repo root (recommended; copy from `local-llm.env.example`)
5. `./local-llm/local-llm.env` (optional legacy folder layout)
6. `~/local-llm/local-llm.env`
7. **Settings → local-llm directory** — `local-llm.env` inside that path

The old **`local-llm` symlink** to the separate git repo is **not** required. If you still use `local-llm.sh` for Qdrant/indexed workflows, point it at the same `DATA_MODEL` / `OLLAMA_HOST` values (e.g. via `~/.config/local-llm/env`).

### Example `local-llm.env` (repo root)

```bash
cp local-llm.env.example local-llm.env
# edit DATA_MODEL and OLLAMA_HOST
```

```bash
OLLAMA_HOST=http://127.0.0.1:11434
DATA_MODEL=qwen3.6:27b-q4_K_M
```

| Variable | BrightVision setting |
|----------|----------------------|
| `OLLAMA_HOST` | **Ollama API base** → injected as `OLLAMA_API_BASE` when spawning the core |
| `DATA_MODEL` / `LLM_MODEL` / `CHAT_MODEL` | **LLM model** as `ollama_chat/<tag>` |

On launch, Vision **fills empty** fields from those files. Use **Settings → Sync settings from .env** to overwrite model and Ollama base from disk. **Save**, then **Terminal → Local LLM → Start** and **Terminal → Start** (session).

## Quick path (macOS)

```bash
# 1. Install Ollama from https://ollama.com/

# 2. In the BrightVision repo
cp local-llm.env.example local-llm.env
# edit DATA_MODEL

# 3. BrightVision → Settings: ollama_chat/<DATA_MODEL>
#    Terminal → Local LLM → Start
#    Terminal → Start (session)
```

Or leave **Auto before session** on and use **Terminal → Start** once.

## Ping LLM

**Ping LLM** runs two checks (no repo edits):

1. **Ollama** — `/api/tags`, `/api/ps`, then a 1-token `/api/generate` probe.
2. **Vision Core** — `GET {coreApiUrl}/health` (default `http://127.0.0.1:8741`).

### Ping status: LLM OK and Core not running

| Part | Meaning |
|------|---------|
| **LLM OK (Nms)** | Ollama is up, your model is pulled, and a tiny generate succeeded — local inference works. |
| **Core not running** | The Python HTTP API is not listening on `:8741` yet. That is normal when the session is **Stopped**. |

Fix: **Terminal → Start** (starts `bright-vision-core-serve` and the session). **Ping LLM** again; you should see **Core OK**. Local LLM (**Start Local LLM**) and the session (**Start**) are separate steps unless **Auto before session** is on.

**Not in /api/ps** only means the model is not loaded in RAM; ping can still pass if the tag is pulled.

## Why a model sometimes unloads

See previous troubleshooting themes: Ollama default TTL, **Unload** in the app, `OLLAMA_MAX_LOADED_MODELS=1` when Vision starts `ollama serve`. Chat turns now send `keep_alive: -1` via LiteLLM. Machine-wide: `export OLLAMA_KEEP_ALIVE=-1` before `ollama serve`.

## Do you need `local-llm.sh`?

**No**, for BrightVision desktop use. **Yes**, only if you separately run the **local-llm** repo for indexed/Qdrant stacks (`./local-llm.sh start indexed`). That script is unrelated to the in-app **Start Local LLM** button.
