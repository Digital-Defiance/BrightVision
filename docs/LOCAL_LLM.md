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

**Settings → Local model router** (Ollama sessions only) classifies each prompt and picks from the **model hopper**: enable one or more **fast** and **heavy** models (switches per row), set tier, reorder priority. Empty heavy id uses your main LLM model. Fast tier uses `keep_alive: 5m`; heavy uses `keep_alive: 0`.

**Configure from disk** (optional) — add to `local-llm.env`:

```bash
MODEL_ROUTER=1
FAST_MODEL=deepseek-coder:6.7b
HEAVY_MODEL=qwen3.6:27b-q4_K_M
```

Tags are bare Ollama names (no `ollama_chat/` prefix). Omit `HEAVY_MODEL` to use `DATA_MODEL` / the session LLM for the heavy tier. Then **Settings → Ollama env files → Sync from env files** (overwrites hopper + router flag) or rely on launch **fill empty** for unset hopper slots.

On **Terminal → Start** with the router enabled, BrightVision pulls only the resolved fast/heavy tags (not every hopper row) so startup stays fast when `OLLAMA_MAX_LOADED_MODELS=1`.

**Routing rules (Vision):** Tier choice uses **your message size** for intent (UI wording → fast; architect/refactor keywords → heavy). When the session’s **live context** (Cecli `token_count` on current messages) plus a completion reserve would exceed the **fast model’s `max_input_tokens`**, the router picks **heavy** even for short messages — avoids `exceeds the 16,384 token limit` on small fast models. The capped per-file bump in **~tok** display still does not alone force heavy. Middle-band code tasks default **fast** when context fits (escalate to heavy on failure if enabled).

**Headless** (`bright-vision-core-serve` without the desktop UI): use `BRIGHT_VISION_MODEL_ROUTER=1`, `BRIGHT_VISION_FAST_MODEL=ollama_chat/…`, optional `BRIGHT_VISION_HEAVY_MODEL` — see [ROADMAP.md](./ROADMAP.md#39--local-model-router).

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
# Optional — model router (see § Dynamic model tiering)
# MODEL_ROUTER=1
# FAST_MODEL=deepseek-coder:6.7b
# HEAVY_MODEL=qwen3.6:27b-q4_K_M
```

| Variable | BrightVision setting |
|----------|----------------------|
| `OLLAMA_HOST` | **Ollama API base** → injected as `OLLAMA_API_BASE` when spawning the core |
| `DATA_MODEL` / `LLM_MODEL` / `CHAT_MODEL` | **LLM model** as `ollama_chat/<tag>` |
| `FAST_MODEL` | **Model router** — fast-tier Ollama tag (hopper) |
| `HEAVY_MODEL` | **Model router** — heavy-tier tag; omit to use session / `DATA_MODEL` for heavy |
| `MODEL_ROUTER` | `1` / `true` — enable **Settings → Local model router** on sync |

On launch, Vision **fills empty** fields from those files (including hopper fast/heavy when router slots are empty). Use **Settings → Ollama env files → Sync from env files** to overwrite model, Ollama base, and router hopper from disk, then **Start Local LLM** and **Ping stack** in the same section (same as **Terminal → Local LLM**). **Save** (persists Settings), then **Terminal → Start** (session).

## Quick path (macOS)

```bash
# 1. Install Ollama from https://ollama.com/

# 2. In the BrightVision repo
cp local-llm.env.example local-llm.env
# edit DATA_MODEL

# 3. BrightVision → Settings → Sync from env files (or launch fill-empty)
#    Terminal → Local LLM → Start
#    Terminal → Start (session)
# Optional: MODEL_ROUTER + FAST_MODEL / HEAVY_MODEL in local-llm.env
```

Or leave **Auto before session** on and use **Terminal → Start** once.

## Ping stack (UI: **Ping stack**)

**Ping stack** (formerly “Ping LLM”) runs two checks (no repo edits). It does **not** start the Vision API:

1. **Ollama** — `/api/tags`, `/api/ps`, then a 1-token `/api/generate` probe.
2. **Vision API** — `GET {coreApiUrl}/health` (default `http://127.0.0.1:8741`).

### Ping status: LLM OK and Vision API not running

| Part | Meaning |
|------|---------|
| **LLM OK (Nms)** | Ollama is up, your model is pulled, and a tiny generate succeeded — local inference works. |
| **Vision API not running** | `bright-vision-core-serve` is not listening on `:8741` yet. That is normal when the session is **Stopped**. The UI shows a **warning** (not green) with the connect error when available. |

Fix: **Settings → Start Vision API** (HTTP only) or **Terminal → Start** (API + coding session). **Ping stack** again; you should see **Vision API OK**. Local LLM (**Start Local LLM**), the API, and the session (**Start**) are separate steps unless **Auto before session** is on.

**Not in /api/ps** only means the model is not loaded in RAM; ping can still pass if the tag is pulled.

## Why a model sometimes unloads

See previous troubleshooting themes: Ollama default TTL, **Unload** in the app, `OLLAMA_MAX_LOADED_MODELS=1` when Vision starts `ollama serve`. Chat turns now send `keep_alive: -1` via LiteLLM. Machine-wide: `export OLLAMA_KEEP_ALIVE=-1` before `ollama serve`.

## Do you need `local-llm.sh`?

**No**, for BrightVision desktop use. **Yes**, only if you separately run the **local-llm** repo for indexed/Qdrant stacks (`./local-llm.sh start indexed`). That script is unrelated to the in-app **Start Local LLM** button.
