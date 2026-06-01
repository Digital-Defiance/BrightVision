# BrightVision functionality checklist

Use before changing the `cecli/` submodule pin or opening upstream PRs.

## Two layers (both required for the desktop app)

| Layer | Location | Role |
|-------|----------|------|
| **cecli** | `cecli/` (upstream engine) | LLM loop, coders, slash commands, agents, MCP |
| **bright_vision_core** | `bright_vision_core/` (**not** in upstream cecli) | HTTP/SSE, streaming tokens, superproject git, todos |

**Upstream cecli PR branch `pr/brightvision-cecli-only` contains only two cecli files.** It does **not** include `bright_vision_core/`. Never point daily dev or the parent submodule at that SHA.

**Layout:** `bright_vision_core/` in the BrightVision parent repo; agent in submodule `cecli/`.

## Tier 1 — must ship in `bright_vision_core/` (shell breaks without these)

| Module | Function |
|--------|----------|
| `http_api.py`, `http_auth.py` | FastAPI routes the React app calls (`/health`, `/sessions`, messages SSE, todos, files, confirm, undo) |
| `session.py` | Turn lifecycle: `yield_stream=True`, `run_message` → `token` events, `done` payload |
| `event_io.py` | Structured events; tokens **not** duplicated to stdout |
| `async_bridge.py` | Async `coder.send_message()` → sync generator for SSE |
| `vision_runtime.py`, `cli_serve.py`, `vision_serve.py` | `bright-vision-core-serve` on `:8741` |
| `git_workspace.py` | Superproject / submodule `RepoSet` (cecli has no equivalent) |
| `workspace_todos.py`, `todo_*.py` | Tasks tab + spec jobs |
| `headless_stdio.py`, `headless_args.py` | Headless / Tauri spawn |
| `gui_progress.py` | Progress → activity bar |
| `model_router.py`, `model_router_apply.py` | Fast/heavy routing (if enabled in settings) |
| `slash_helpers.py` | Slash command glue for HTTP layer |
| `brand.py` | Product strings |

Align event types with parent `src/ipc/events.ts`.

## Tier 1 — cecli deltas we still need (until upstream merges PR)

| File | Why keep |
|------|----------|
| `cecli/commands/add.py` | RepoSet / ignore-path UX for `/add` |
| `cecli/models.py` | Ollama `keep_alive=-1` default |

After upstream merges, drop vendored copies of these hunks and pin `cecli` version instead.

## Streaming (not lost when cecli is vanilla)

1. Upstream `cecli` already streams from `Coder.send_message()` (`yield_stream` flag on `base_coder`).
2. `session.py` sets `self.coder.yield_stream = True` and emits `{"type": "token", "text": ...}` per chunk.
3. `event_io.py` avoids echoing the same text to stdout (dedupe — parent roadmap #1 / #8).
4. React handles SSE in `src/ipc/events.ts`, `chatStream.ts`, `App.tsx`.

No additional `cecli/coders/base_coder.py` fork patches are required on current `main` unless pytest or dogfood shows a gap.

## Verify before pin bump

```bash
source activate.sh

# No legacy imports
rg 'from bright_vision_core|import bright_vision_core' bright_vision_core/ \
  && echo FAIL || echo OK

yarn test:bright-core
yarn test:local
```

Optional LLM smoke: `E2E_LLM=1 yarn test:e2e:llm` — [TESTING.md](./TESTING.md).

## `cecli/` submodule pin

```bash
git submodule update --init cecli
cd cecli && git log -1 --oneline && cd ..
git add cecli
```

Document the SHA in [CECLI_PIN.md](./CECLI_PIN.md) when you change the pin.
