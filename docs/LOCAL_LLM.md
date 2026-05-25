# Local LLM setup (recommended)

Aider Vision is **privacy-first**: the default path is a **local** model on your machine via [Ollama](https://ollama.com/), not rented cloud inference.

## Built into the desktop app

The Tauri app manages local inference for you:

- **Terminal → Local LLM** — **Start** / **Unload** / **Ping LLM** / **Refresh** (Ollama up, pull, preload with `keep_alive: -1`)
- **Ollama models** — on **Refresh**, lists `/api/tags` (pulled) and `/api/ps` (loaded in RAM)
- **Auto before session** (default) — **Terminal → Start** runs Local LLM first, then Vision Core
- Reads **`local-llm.env`** for `OLLAMA_HOST` and `DATA_MODEL` (see [Configuration files](#configuration-files))

### What Start does

1. Ensure [Ollama](https://ollama.com/) is running (starts `ollama serve` on macOS when needed)
2. `ollama pull` your chat model if missing
3. Preload the model via Ollama’s `/api/generate` (`keep_alive: -1` so it stays loaded)
4. Vision session uses **Ollama API base** and `ollama_chat/<tag>` from Settings

Toggle **Auto before session** in Settings or the Terminal Local LLM panel.

### Ping LLM (health check, no repo edits)

**Ping LLM** runs a minimal roundtrip without starting a chat turn or modifying project files:

1. `GET /api/tags` — Ollama server up  
2. Model in tags + optional `/api/ps` (loaded in RAM)  
3. `POST /api/generate` with `num_predict: 1` — proves inference works; shows latency  
4. Optional `GET {coreApiUrl}/health` — Vision core API reachable  

Use this when the activity bar says “Waiting for model” but CPU is idle, or before queuing many `/add` messages.

## What you install

| Piece | Role |
|-------|------|
| **[Ollama](https://ollama.com/)** | Runs the model server (default API `http://127.0.0.1:11434`). |
| **Aider Vision** | Starts Ollama if needed, pulls and preloads your model, then runs the coding session. |

Vision does **not** bundle Ollama or model weights.

## Configuration files

Vision loads env keys from these paths (later files win):

1. `~/.config/local-llm/env`
2. `$LOCAL_LLM_DIR/local-llm.env` (if set)
3. `{aider-vision}/local-llm/local-llm.env` — optional file or symlink (gitignored)
4. `~/local-llm/local-llm.env`
5. **Settings → local-llm directory** (optional) — `local-llm.env` inside that path, applied last

### Example `local-llm.env`

Create `local-llm/local-llm.env` in the repo (or any path above):

```bash
OLLAMA_HOST=http://127.0.0.1:11434
DATA_MODEL=qwen3.6:27b-q4_K_M
```

| Variable | Aider Vision setting |
|----------|----------------------|
| `OLLAMA_HOST` | **Ollama API base** → `OLLAMA_API_BASE` on engine spawn |
| `DATA_MODEL` / `LLM_MODEL` / `CHAT_MODEL` | **LLM model** as `ollama_chat/<tag>` |

On launch, Vision **fills empty** fields from those files. Use **Settings → Sync settings from .env** to overwrite model and Ollama base from disk. **Save**, then **Terminal → Stop / Start**.

## Quick path (macOS)

```bash
# 1. Install Ollama from https://ollama.com/ and open it once.

# 2. Configure env (in repo or ~/.config/local-llm/env)
mkdir -p local-llm
cat > local-llm/local-llm.env <<'EOF'
OLLAMA_HOST=http://127.0.0.1:11434
DATA_MODEL=qwen3.6:27b-q4_K_M
EOF

# 3. Open Aider Vision → Settings → Model & system
#    LLM model: ollama_chat/qwen3.6:27b-q4_K_M  (match DATA_MODEL)
#    Save → Terminal → Local LLM → Start → Terminal → Start (session)
```

Or leave **Auto before session** on and press **Terminal → Start** once — Local LLM runs automatically.

## Model name in Vision vs Ollama tag

| Where | Example |
|-------|---------|
| Ollama / `DATA_MODEL` in `local-llm.env` | `qwen3.6:27b-q4_K_M` |
| Aider Vision **Settings → LLM model** | `ollama_chat/qwen3.6:27b-q4_K_M` |

Vision Core routes models through **LiteLLM**. The `ollama_chat/` prefix selects the Ollama provider; the part after `/` must match the tag Ollama has loaded (`ollama list`).

## Do you need `OLLAMA_API_BASE`?

**Usually no** if `OLLAMA_HOST` is default (`http://127.0.0.1:11434`) — leave **Ollama API base** empty or use **Sync settings from .env**.

Set **`OLLAMA_HOST`** in `local-llm.env` (or **Ollama API base** in Settings) when Ollama uses a custom URL. Vision injects the saved base when spawning the core.

## Cloud and other providers

Defaults emphasize **local Ollama**; cloud APIs still work.

| Provider style | Settings | Environment (inherited by core) |
|----------------|----------|-----------------------------------|
| Ollama (default) | `ollama_chat/<tag>` | Optional `OLLAMA_API_BASE` |
| OpenAI | `openai/gpt-4o` (example) | `OPENAI_API_KEY` |
| Anthropic | `anthropic/claude-…` | `ANTHROPIC_API_KEY` |
| Others | Any [LiteLLM](https://docs.litellm.ai/docs/providers) model string | Provider-specific keys |

Steps:

1. Turn off **Auto before session** if you do not use Ollama.
2. Set **LLM model** to the LiteLLM id (not `ollama_chat/…`).
3. Export API keys in the environment that launches the app.
4. **Save** settings, **Terminal → Start**.

## Vision models (images / PDF)

Chat attach for images/PDF requires a **vision-capable** model. Many local chat models are text-only; pick a multimodal Ollama model or use a cloud vision model with the appropriate API key.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Session starts then errors on first message | **Local LLM → Ping LLM**; model in `/api/ps`? Settings model matches `ollama list`? |
| Connection refused to Ollama | Ollama running? `curl -s http://127.0.0.1:11434/api/tags` |
| Wrong model loaded | `DATA_MODEL` in `local-llm.env` vs `ollama_chat/…` in Settings |
| Model unloads mid-session | **Local LLM → Start** or **Refresh** (re-applies `keep_alive: -1`); optional `OLLAMA_KEEP_ALIVE=-1` for Ollama |
| Custom Ollama port/host | `OLLAMA_HOST` in `local-llm.env` or **Ollama API base** in Settings |

See also [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

## Related

- [USER_WORKFLOW.md](./USER_WORKFLOW.md) — day-to-day app flow  
- [DEVELOPMENT.md](./DEVELOPMENT.md) — hacking on Vision itself  
