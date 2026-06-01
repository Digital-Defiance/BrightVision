# Testing (local-first)

All checks run on **your machine**. Nothing here requires GitHub Actions — workflow files under `.github/workflows/` stay in the repo for optional use later.

## Quick reference

| When | Command | Rough time |
|------|---------|------------|
| After a small TS/UI change | `yarn test:fast` | ~5s |
| Before pushing (default) | `yarn test:local` | ~15s |
| Before a larger UI/session change | `yarn test:full` | ~1–2 min |
| Before a release / submodule bump | `sh scripts/test-local.sh release` | full + verify |

Same tiers via shell:

```bash
sh scripts/test-local.sh fast      # tsc + Vitest
sh scripts/test-local.sh local     # + Rust
sh scripts/test-local.sh full      # + Playwright e2e
sh scripts/test-local.sh release     # + verify:submodule if .venv exists
```

## One-time setup

```bash
yarn install
npx playwright install chromium   # only needed for test:e2e / test:full
```

With core Python work:

```bash
source activate.sh   # creates .venv for verify:submodule
```

## Unit tests (Vitest)

```bash
yarn test
# watch mode while developing:
yarn test:watch
```

Covers chat stream parsing (including optimistic user-message reconcile), commit graph layout, auto-stage policy, session lifecycle, git labels.

**Cecli session persistence / encryption** (run with activated venv):

```bash
source activate.sh
# Cecli submodule (upstream PR surface)
python -m pytest cecli/tests/basic/test_session_crypto.py \
  cecli/tests/basic/test_session_args.py \
  cecli/tests/basic/test_sessions_manager.py -q
# BrightVision integration
python -m pytest \
  tests/core/test_session_crypto.py \
  tests/core/test_headless_persistence.py \
  tests/core/test_sessions.py \
  tests/core/test_http_session_persistence.py -q
```

Or `yarn test:bright-core` (BrightVision `tests/core/*` modules; run cecli tests before upstream PR).

## Rust (Tauri git_ops)

```bash
yarn test:rust
```

Included in `yarn test:local` and `yarn test:full`.

## End-to-end (Playwright)

Browser tests use **Vite preview** with a **mocked** `/api/core` API and optional **mocked Tauri** `invoke` (no real desktop shell, no real `:8741` server).

```bash
yarn test:e2e
```

**Coverage matrix:** [e2e/ROADMAP_COVERAGE.md](../e2e/ROADMAP_COVERAGE.md)

| Suite | Area |
|-------|------|
| `session-lifecycle.spec.ts` | Start/stop, connecting, health recovery |
| `navigation.spec.ts` | Main tabs |
| `chat-ux.spec.ts` | Sections, proposed edits, token stats; optimistic user bubble on send |
| `stream-chat.spec.ts` | Tool output order in timeline; cumulative stream dedupe (#1, #8) |
| `progress-activity.spec.ts` | Determinate activity bar from core `progress` SSE (repo scan) |
| `chat-input.spec.ts` | Send clears input + user bubble; queue, stop turn, multiline |
| `confirm-flow.spec.ts` | Confirm banner |
| `chat-context.spec.ts` | Folder attach |
| `tasks-workspace.spec.ts` | Tasks + generate-spec |
| `settings-config.spec.ts` | Settings persistence; Cecli session encrypt/auto-save API flags |
| `tauri-git.spec.ts` | Git panel (mock Tauri) |
| `path-completion.spec.ts` | `/add` Tab (desktop vs web) |
| `file-upload.spec.ts` | Upload + native attach mock |
| `git-polling.spec.ts` | 8s git status poll |
| `release-hygiene.spec.ts` | RELEASE / submodule file checks |
| `roadmap-gaps.spec.ts` | Open roadmap smoke |

Helpers live in `e2e/helpers/` (`mockCoreApi`, `mockTauri`, `session`, `fixtures`, `testConfig`).

Use `startMockSession(page, { tauri: true })` for desktop-only UI in the browser.

### Useful e2e commands

```bash
yarn test:e2e                                    # all (~44 tests)
yarn playwright test e2e/session-lifecycle.spec.ts
yarn playwright test --ui                        # debug interactively
```

Playwright uses **`vite.config.ts`** only (do not commit a stale `vite.config.js` — Vite prefers `.js` over `.ts` and will skip the E2E health stub + enable the `:8741` proxy).

Playwright starts a fresh `E2E=1` preview via `scripts/e2e-preview.sh` (kills anything listening on port **4173** first). If preview still fails:

```bash
lsof -ti tcp:4173 | xargs kill -9   # macOS/Linux
yarn test:e2e
```

If you see `[vite] http proxy error: /health`, an old preview without `E2E=1` was reused — re-run (do not use `reuseExistingServer` for default e2e).

`gotoVision()` installs Playwright API mocks **before** `page.goto()` so health checks never hit a real Vision API.

### Real LLM e2e (Ollama + Vision API)

Exercises a **live** `bright-vision-core` on `:8741` and your **Ollama** model (not mocked SSE). Use this to catch “hello” stalls and SSE timeouts.

**Prerequisites**

1. [Ollama](https://ollama.com/) running (`ollama serve` or the desktop app).
2. Ollama running (`ollama serve`). LLM tests default to `llama3.2:3b` and run **`ollama pull`** automatically if the model is missing (disable with `E2E_OLLAMA_AUTO_PULL=0`).
3. Python env: `source activate.sh` from **one** repo path (installs cecli, `bright_vision_core`, uvicorn, pytest). If the repo is reachable as both `/Users/.../BrightVision` and `/Volumes/.../BrightVision`, use the same path for the shell and Playwright (`cd "$(pwd -P)"`).
4. Port **8741** free (or stop a leftover server: `kill $(lsof -ti tcp:8741)`).

**Run**

```bash
# Core-only (SSE + Ollama; hello + /agent) — uses llama3.2:3b via package.json
yarn test:llm:core

# Full UI path: Terminal Start → Chat → hello + /agent
yarn test:e2e:llm

# Explicit env (override model or host):
E2E_OLLAMA_MODEL=ollama_chat/llama3.2:3b E2E_LLM=1 yarn test:llm:core
E2E_OLLAMA_MODEL=ollama_chat/llama3.2:3b E2E_LLM=1 yarn test:e2e:llm
```

Optional env:

| Variable | Purpose |
|----------|---------|
| `E2E_OLLAMA_MODEL` | LiteLLM id or bare tag (`yarn test:llm:core` sets `ollama_chat/llama3.2:3b`) |
| `E2E_OLLAMA_AUTO_PULL` | `1` (default): run `ollama pull` when the model is missing; `0` to fail fast |
| `E2E_OLLAMA_HOST` | Ollama base URL (default `http://127.0.0.1:11434`) |
| `E2E_PYTHON` | Venv shim for spawning Vision API (default `.venv/bin/python3`; `test:e2e:llm` sets this — do not point at Homebrew `python3.14` alone) |

E2E clears **`PYTHONPATH`**. Do not export `PYTHONPATH=$PWD` — the repo’s `cecli/` folder is not the Python package and will break `import cecli` (`unknown location`).

LLM UI e2e uses workspace `e2e/fixtures/hello-workspace` (minimal git repo), not the BrightVision superproject tree.

Default `yarn test:e2e` **does not** run `hello-llm.spec.ts` or `agent-llm.spec.ts`.

`/agent` LLM tests use a strict no-tools prompt; large models may take several minutes (Playwright timeout 7m per test).

## Manual smoke (not Playwright)

After `yarn test:full`, when you change engine or desktop integration:

```bash
source activate.sh
yarn tauri dev
```

Check: Terminal Start/Stop, Chat send, Tasks tab, Git tab (real `git`), attach images.

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) if the session sticks on **Connecting**.

## Core Python (optional)

```bash
yarn test:git-workspace
yarn verify:submodule          # needs .venv — also in test-local.sh release
source activate.sh                 # cecli + bright_vision_core on PYTHONPATH
yarn test:bright-core              # Vision API + headless /agent regression tests
```

Includes `test_headless_args.py` and `test_headless_agent.py` (agent mode + `verbose` on headless args).

```bash
python -m pytest tests/core/test_headless_args.py tests/core/test_headless_agent.py -q
```

## Script aliases

| Script | Same as |
|--------|---------|
| `yarn test:fast` | `test-local.sh fast` |
| `yarn test:local` | `test-local.sh local` |
| `yarn test:full` | `test-local.sh full` |
| `yarn test:all` | `yarn test:full` (alias) |

## What stays manual

- Real `yarn tauri` + OS dialogs and true git binary (e2e uses mocks)
- Native FS notify (#26) — app uses periodic git poll; see `git-polling.spec.ts`
- Git tag / submodule pointer bump (#31) — [RELEASE.md](./RELEASE.md)
