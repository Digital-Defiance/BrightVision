# BrightVision architecture

## Head and body

| Layer | Role | Location |
|-------|------|----------|
| **Head** | UI, prompts, user intent, product wiring | `src/` (React) + `src-tauri/` (desktop shell) |
| **Body** | **[Cecli](https://cecli.dev)** agent + Vision HTTP/SSE | `cecli/` submodule + `bright_vision_core/` in this repo |

| Package | Location | Role |
|---------|----------|------|
| **`cecli`** | Submodule `cecli/` | Coders, LiteLLM, `repo`, `commands/` (terminal agent; not exposed in the app UI) |
| **`bright_vision_core`** | Parent repo | HTTP API, `Session`, SSE, `git_workspace`, workspace todos |

BrightVision **beheads** the old standalone aider/cecli terminal UX. Users never type into the engine CLI in the app. Every turn is:

```text
React (CoreHttpClient)
  → Vision HTTP API (SSE)
  → bright_vision_core.Session.run_message
  → cecli (coders / llm / repo)
  → events → React (src/ipc/events.ts)
```

## User project vs engine install

| Concept | What it is |
|---------|------------|
| **Project** (`VisionConfig.workingDir`) | Git repo the agent edits — any path the user chooses |
| **Engine** | `cecli/` + `bright_vision_core/` beside the app; `source activate.sh` or Tauri spawn of `scripts/vision_serve.py` |

The user’s project does **not** need a copy of the engine inside it. Nested submodules **inside** the project are handled by core `RepoSet`.

## API surface (canonical)

Same contract in desktop and browser:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness |
| `POST` | `/sessions` | Create session (workspace, model, optional files) |
| `POST` | `/sessions/{id}/messages` | User message → **SSE** stream of event dicts |
| `POST` | `/sessions/{id}/undo` | Undo last turn |
| `DELETE` | `/sessions/{id}` | End session |

Additional routes (todos, files, confirm, agents): see `docs/IPC.md`.

**Desktop:** Tauri `start_core_api` runs `scripts/vision_serve.py` from the engine tree → `bright-vision-core-serve` on `http://127.0.0.1:<port>`. React uses the same `CoreHttpClient` as web.

**Web:** Run `bright-vision-core-serve` or use Vite proxy `/api/core` → `:8741`.

**Dev:** `source activate.sh` → editable `cecli` + `bright_vision_core`.

## Multi-repo workspaces

`workspace` on session create = git **superproject root**. Core (`create_git_workspace()` / `RepoSet` in `bright_vision_core`):

- Discovers nested submodules (`git submodule status --recursive` + `.gitmodules` walk)
- Commits inner repos first, then parent gitlinks
- Excludes gitlink paths (`160000`) from repo-map file lists

React only passes the workspace string; it does not implement submodule logic.

For dogfooding BrightVision itself: set project to the **parent** repo (this tree).

## Local LLM vs session

| Concern | Layer |
|---------|--------|
| Start Ollama, pull, preload, ping | Rust (`src-tauri`, Settings / Terminal → Local LLM) |
| Chat turns, tools, git edits | Python `bright_vision_core` over HTTP/SSE |

Configure `local-llm.env` or `~/.config/local-llm/env` (`DATA_MODEL`, `OLLAMA_HOST`, optional `FAST_MODEL` / `HEAVY_MODEL` / `MODEL_ROUTER`); map to Settings `ollama_chat/<tag>` and the model hopper via **Sync from env files**. See `docs/LOCAL_LLM.md`.

## What we do not do

- No interactive cecli/aider CLI in the product UI
- No bypassing React to drive the engine directly
- No duplicate event schemas (legacy `{type,payload}` is retired)
- No breaking `src/ipc/events.ts` without matching `bright_vision_core` SSE in the same change

## Related docs

- `docs/IPC.md` — HTTP routes, SSE shapes, todos API
- `docs/DEVELOPMENT.md` — setup, `yarn tauri dev`, testing
- `docs/CECLI_MIGRATION_ROADMAP.md` — engine port history (cecli + `bright_vision_core`)
- `AGENTS.md` — agent charter and repo map
