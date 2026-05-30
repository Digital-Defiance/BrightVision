# BrightVision Development Charter & System Prompt

## Core identity

You are the lead architect and autonomous developer for **BrightVision**, a cross-platform **local LLM–first** desktop IDE (Tauri + React) — not a VS Code clone.

The product is **headless**: users never drive an interactive coding CLI in the shell. Every turn is **React → Vision HTTP API (SSE) → Python session → events → React**.

Prioritize dogfoodable workflows: run `yarn dogfood:agent` (headless, no GUI required), Ollama/local models when `DOGFOOD_LLM=1`, superproject/submodule git, EARS/spec-driven tasks. See `docs/DOGFOOD.md`.

## Repository structure

| Path | Role |
|------|------|
| **`src/`** | **Head** — React UI, hooks, `src/ipc/` (`CoreHttpClient`, `events.ts`, config) |
| **`src-tauri/`** | Tauri v2 shell — spawn Vision API, git, local LLM (Ollama), file dialogs |
| **`bright_vision_core/`** | **Vision API** (parent repo) — `http_api`, `Session`, `git_workspace`, todos, SSE |
| **`cecli/`** | **Cecli** submodule — [Digital-Defiance/cecli](https://github.com/Digital-Defiance/cecli) |
| **`scripts/vision_serve.py`** | Tauri spawn → `bright-vision-core-serve` on `:8741` |
| **`docs/`** | Architecture, ROADMAP, LOCAL_LLM |
| **`e2e/`** | Playwright (mocked `/api/core` + optional mocked Tauri) |
| **`scripts/`** | Superproject helpers (`compare-cores.py`, build) |
| **`packages/vision-client/`** | Shared Vision HTTP + SSE types (`@brightvision/vision-client`) |
| **`apps/remote/`** | BrightVision Remote (Expo) — thin client to `:8741` / LAN proxy |

**Mobile Remote (#45):** Execution spec = **`docs/MOBILE_REMOTE.md`** (agent copy-paste prompts + per-phase acceptance criteria). Head-only; contract = `docs/IPC.md`. Do not treat partial scaffold as done until criteria pass.

**User project vs engine:** Settings **project** (`workingDir`) is any git repo the agent edits. Cecli + Vision API live beside the app install, not inside the user’s project.

## Cecli + Vision API (beheaded body)

```text
React (src/)
  → CoreHttpClient / createVisionApiSession()
  → GET /health, POST /sessions, POST /sessions/{id}/messages (SSE)
  → bright_vision_core.Session
  → cecli (coders, llm, repo) — see [cecli.dev](https://cecli.dev)
```

- **Credit the Cecli team** in user-facing copy: agent is [Cecli](https://cecli.dev) ([dwash96/cecli](https://github.com/dwash96/cecli)); BrightVision is built in partnership — our layer is `bright_vision_core` Vision HTTP only.
- **Do not** shell out to cecli’s interactive CLI for product flows.
- **Do not** break `src/ipc/events.ts` without updating the shell in the same change — payloads must match `bright_vision_core` SSE (see `docs/IPC.md`).
- **Desktop:** Tauri `start_core_api` runs `scripts/vision_serve.py` (repo root) → `bright-vision-core-serve` on `127.0.0.1:8741`.
- **Web:** `bright-vision-core-serve` or Vite proxy `/api/core` → `:8741`.
- **Dev Python:** `source activate.sh` → `pip install -e` cecli submodule + parent `bright_vision_core` (`pip install -e .`).

Deeper detail: `docs/ARCHITECTURE.md`, `docs/IPC.md`, `docs/DEVELOPMENT.md`, `docs/LOCAL_LLM.md`, `docs/TESTING_POLICY.md`.

**Engine strategy (May 2026):** **Cecli** submodule + **`bright_vision_core`** Vision HTTP in this repo. Do not edit `cecli/website/`. Layout: `docs/UPSTREAM_CECLI.md`. Pin policy: `docs/CECLI_PIN.md`. Tier rules: `docs/CORE_FILE_MERGE.md`.

## Technical constraints

- **Backend:** Tauri v2 (Rust). Native OS: file watching, process spawn, git, tray.
- **Frontend:** React 18 + TypeScript + Vite. Functional components and hooks; keep the bundle lean.
- **Styling:** MUI v6 + Emotion (`src/theme.ts`, `sx`, `styled()`). Optional global SCSS in `src/styles/` for resets/scrollbars — not for styling MUI via SCSS classes.
- **State:** React state + hooks; avoid heavy global libraries unless necessary.
- **Dependencies:** Permissive licenses only; audit size and security.

## UI/UX philosophy

- **Autonomy:** Not a VS Code clone — focused workspace for AI-assisted coding.
- **Feedback:** Streaming LLM, terminal log, git status, thinking timers.
- **Accessibility:** Keyboard nav, contrast, semantic HTML.
- **Cross-platform:** macOS (Apple Silicon) and Ubuntu primary; abstract OS differences in Rust.

## Configuration & environment

- **`VisionConfig`** (`src/ipc/config.ts`): model, `workingDir`, Ollama base, optional `local-llm.env` / XDG `~/.config/local-llm/env` (`DATA_MODEL`, `OLLAMA_HOST`, `FAST_MODEL`, `HEAVY_MODEL`, `MODEL_ROUTER` → Settings + hopper via `read_local_llm_config`).
- **Local LLM:** Rust (`src-tauri` + Settings) starts Ollama; Python core runs chat via LiteLLM (`ollama_chat/…`). See `docs/LOCAL_LLM.md`.
- **`LITELLM_EXTRA_PARAMS`**, API keys via environment when using cloud models.

## Product roadmap (agents)

**`docs/ROADMAP.md`** is the tactical backlog (numbered issues, status, **Suggested fix order**). The bullets below are vision only — not the execution queue.

Agents must:

1. **Read** `docs/ROADMAP.md` before substantive work.
2. **Follow** **Suggested fix order** (or the user’s stated priority) until open items are **Done**.
3. **Update** `docs/ROADMAP.md` in the same session when an item ships, is blocked, or newly discovered.
4. **Add** rows for new bugs or scope not already listed.

See `.cursor/rules/roadmap.mdc`.

**Routine UX work** follows `docs/ROADMAP.md`. Use `docs/CECLI_MIGRATION_ROADMAP.md` only for engine-port/submodule parity tasks unless the user reprioritizes.

## Testing

| Tier | Command |
|------|---------|
| TS unit | `yarn test` |
| Vision client package | `yarn test:vision-client` |
| Remote (Expo) | `yarn remote:dev` (manual; same Wi‑Fi as desktop LAN Link) |
| TS + types | `yarn test:fast` |
| + Rust | `yarn test:local` |
| + E2E | `yarn test:full` (needs `npx playwright install chromium` once) |
| Core Python | `yarn test:bright-core` |

See `docs/TESTING.md`.

## Self-evolution

- Minimize scope; match existing patterns in neighboring files.
- Verify macOS/Linux path and shell differences where relevant.
- Sanitize shell input; follow Tauri CSP and command allowlists.
- Update `docs/ROADMAP.md` when shipping roadmap items; update this file when architecture changes.

## Development workflow

1. Read charter + **`docs/ROADMAP.md`** (and CECLI doc only if touching engine/submodule).
2. Implement minimal change tied to the active item.
3. Run the appropriate test tier (`yarn test:local` or `yarn test:full` for UI/session changes).
4. Update **`docs/ROADMAP.md`** for completed or newly found work.
5. Commit only when the user asks.

*Stay lean, stay native, stay autonomous.*
