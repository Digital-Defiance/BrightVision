# Testing (local-first)

All checks run on **your machine**. Nothing here requires GitHub Actions — workflow files under `.github/workflows/` stay in the repo for optional use later.

**Feature / roadmap testing policy:** [TESTING_POLICY.md](./TESTING_POLICY.md) (definition of done, tiers, what stays manual).

## Quick reference

| When | Command | Rough time |
|------|---------|------------|
| After a small TS/UI change | `yarn test:fast` | ~5s |
| Before pushing (default) | `yarn test:local` | ~15s |
| Before a larger UI/session change | `yarn test:full` | ~1–2 min |
| Real core + Tasks bridge (no mocks) | `yarn test:e2e:integration` | ~2–3 min |
| Before a release / submodule bump | `sh scripts/test-local.sh release` | full + bright-core pytest + integration e2e + verify |
| **Agent dogfood (default self-dev)** | `yarn dogfood:agent` | check + gate; optional `DOGFOOD_LLM=1` — [DOGFOOD.md](./DOGFOOD.md) |
| Self-dev preflight only | `yarn dogfood:check` | ~20s |
| Full dogfood gate only | `yarn dogfood:gate` | release tier; optional `DOGFOOD_LLM=1` |
| Scenario matrix (all registered SSE outputs) | `yarn test:e2e shipped-scenarios` | ~2–3 min |
| Fixture-pack structure preflight | `yarn test:e2e:fixtures` | ~1s |
| **100% automated confidence** (dogfood check + release + fixtures + full LLM incl. superproject) | `yarn test:everything` (`bright_vision_core.test_suite` CLI) | ~20–35 min with Ollama; superset of `DOGFOOD_LLM=1 DOGFOOD_SUPERPROJECT_LLM=1 yarn dogfood:agent` + `test:e2e:fixtures`. Timing history in `.bright-vision/test-everything-timing.json`; optional [`gpucap`](https://github.com/Digital-Defiance/gpucap) per step (`SKIP_GPU=1` to skip). |
| **Test Lab UI** (desktop) | `yarn test-lab:dev` | Separate Tauri app (`apps/test-lab`): progress bar, GitHub-style step accordions, GPU chips; orchestrator default **:8743** (`BV_TEST_ORCHESTRATOR_PORT`; LAN proxy stays :8742). See [apps/test-lab/README.md](../apps/test-lab/README.md). |
| Full transcript on disk | `yarn test:everything -- --logged` or Test Lab **Save full transcript** | `.bright-vision/test-suite-runs/run-*.log` (or `TEST_EVERYTHING_LOG` / `test-everything-log.txt`) |
| Legacy shell wrapper | `yarn test:everything:shell` / `yarn test:everything:logged` | Same Python CLI; `:logged` passes `--logged` |
| Cloud / custom OpenAI base URL smoke | `yarn test:cloud-llm` (needs `cloud-llm.env`, `E2E_CLOUD_LLM=1` inside script) | ~15–45 s when passing |

Same tiers via shell:

```bash
sh scripts/test-local.sh fast      # tsc + Vitest
sh scripts/test-local.sh local     # + Rust
sh scripts/test-local.sh full      # + Playwright e2e
sh scripts/test-local.sh integration  # + real :8741 Playwright (no mockCoreApi)
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
# Optional: /add attachment staging-path regression only (class is TestCommands)
python -m pytest \
  cecli/tests/basic/test_commands.py::TestCommands::test_cmd_add_skips_create_on_attachment_staging_path -q
# Or full cecli session + commands module:
# python -m pytest cecli/tests/basic/test_session_*.py cecli/tests/basic/test_commands.py -q
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
| `proposed-edits-apply.spec.ts` | Apply to workspace (mock Tauri read/write) |
| `suggested-files.spec.ts` | Tray, add all, add while busy, open in editor |
| `agents-bar.spec.ts` | Sub-agent bar + Settings list |
| `ntfy-alerts.spec.ts` | ntfy Settings + test ping |
| `session-context.spec.ts` | Context chip files + tokens |
| `resource-overlay.spec.ts` | CPU/RAM/GPU HUD |
| `local-llm-ping.spec.ts` | Ollama snapshot + Ping LLM |
| `stream-chat.spec.ts` | Tool output order in timeline; cumulative stream dedupe (#1, #8) |
| `chat-input.spec.ts` | Send clears input + user bubble; queue, stop turn, multiline |
| `confirm-flow.spec.ts` | Confirm banner |
| `chat-context.spec.ts` | Folder attach |
| `tasks-workspace.spec.ts` | Tasks + generate-spec |
| `tasks-generate-spec.spec.ts` | Three-layer generate/refine + `ears_blocked` snackbar (mock) |
| `tasks-spec-wizard.spec.ts` | Phased wizard: tab gates, nudges, per-tab generate labels, `section` POST body, All layers |
| `tasks-ears.spec.ts` | Validate EARS (mock lint) |
| `spec-generate-llm.spec.ts` | Real Ollama phased wizard (req → design → tasks) + legacy all-layers (`E2E_LLM=1`, `@spec-gen`) |
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
# Core-only (SSE + Ollama) — hello, /agent, context, todo, edit-block, transcript
yarn test:llm:core

# Full UI path (skips @router — two long chat turns, often flaky on one GPU)
yarn test:e2e:llm

# Opt-in router lane (fast + heavy model turns)
yarn test:e2e:llm:router

# Opt-in: repo root workspace (slow RepoSet map; README via contextFiles at session start)
E2E_SUPERPROJECT_LLM=1 yarn test:e2e:llm:superproject

# All of the above + dogfood:check + release + fixtures (100% confidence bar)
source activate.sh && yarn test:everything

# Same as test:e2e:llm with explicit default model tag
yarn test:e2e:llm:single

# Explicit env (override model or host):
E2E_OLLAMA_MODEL=ollama_chat/llama3.2:3b E2E_LLM=1 yarn test:llm:core
E2E_OLLAMA_MODEL=ollama_chat/llama3.2:3b E2E_LLM=1 yarn test:e2e:llm
# Example bigger model:
E2E_OLLAMA_MODEL=ollama_chat/qwen3.6:27b-q4_K_M E2E_LLM=1 yarn test:e2e:llm
# Router lane with explicit fast/heavy tags:
E2E_FAST_MODEL=ollama_chat/qwen2.5-coder:7b E2E_HEAVY_MODEL=ollama_chat/qwen3.6:27b-q4_K_M yarn test:e2e:llm:router
```

Optional env:

| Variable | Purpose |
|----------|---------|
| `E2E_OLLAMA_MODEL` | LiteLLM id or bare Ollama tag (`ollama_chat/…` or `llama3.2:3b`); `openai/…` / `azure/…` pass through unchanged |
| `E2E_MODEL_ROUTER` | `1` required for `yarn test:e2e:llm:router` (`router-llm.spec.ts`) |
| `E2E_FAST_MODEL` | Router fast tier model tag/id (falls back to `FAST_MODEL`) |
| `E2E_HEAVY_MODEL` | Router heavy tier model tag/id (falls back to `HEAVY_MODEL`) |
| `E2E_OLLAMA_AUTO_PULL` | `1` (default): run `ollama pull` when the model is missing; `0` to fail fast |
| `E2E_OLLAMA_HOST` | Ollama base URL (default `http://127.0.0.1:11434`) |
| `E2E_FIXTURE_PACK_ROOT` | Optional absolute path to a custom fixture repo collection (supports submodule-based packs) |
| `E2E_SUPERPROJECT_LLM` | `1` runs `superproject-llm.spec.ts` (BrightVision repo root; slow) |
| `DOGFOOD_LLM` | `1` with `yarn dogfood:gate` runs `test:llm:core` + `test:e2e:llm` when Ollama is up |
| `LLM_SPEC_GEN_TIMEOUT_S` | Background generate-spec job wall clock (pytest, HTTP job store, UI poll via `VITE_LLM_SPEC_GEN_TIMEOUT_S` at e2e build, `spec-generate-llm` active poll). Test Lab suite defaults `1200`; `test:llm:core` sets `1200` in `package.json`. |
| `LLM_SPEC_GEN_TURN_TIMEOUT_S` | Per one-shot LLM turn inside generate-spec (`run_one_shot`; `test:llm:core` / Test Lab suite default `1200`; CLI `900`) |
| `LLM_TEST_TURN_TIMEOUT_S` | Per-turn SSE read cap in pytest (`900` in `yarn test:llm:core`; `1200` in Test Lab `llm:core` step) |
| `VISION_AGENT_PREPROC_TIMEOUT_S` | `/agent` preproc cap (`0` = no cap, recommended for local LLM; positive value limits slash phase only) |
| `VISION_SLASH_PREPROC_TIMEOUT_S` | Cap for other slash preproc (`300` in `test:llm:core`, `360` in Test Lab suite) |
| `SKIP_OLLAMA_WARMUP` | `1` skips `scripts/ollama-warmup-for-tests.sh` before suite `llm:core` |
| `DOGFOOD_SUPERPROJECT_LLM` | `1` with `dogfood:gate` also runs superproject LLM lane |
| `E2E_PYTHON` | Venv shim for spawning Vision API (default `.venv/bin/python3`; `test:e2e:llm` sets this — do not point at Homebrew `python3.14` alone) |
| `E2E_VISION_MODEL` | Full LiteLLM id for cloud lanes (`openai/gpt-4o-mini`, `azure/…`); preferred over `E2E_OLLAMA_MODEL` for non-Ollama models |

E2E clears **`PYTHONPATH`**. Do not export `PYTHONPATH=$PWD` — the repo’s `cecli/` folder is not the Python package and will break `import cecli` (`unknown location`).

### Cloud / OpenAI-compatible LLM (opt-in)

Not part of `yarn test:everything` or `DOGFOOD_LLM` (those stay Ollama-first). Use this to validate a custom **`OPENAI_API_BASE`** (proxy, Azure-compatible gateway, etc.) without pulling Ollama.

1. Copy `cloud-llm.env.example` → `cloud-llm.env` (gitignored). For Azure’s **OpenAI v1** portal sample use `OPENAI_API_BASE=https://<resource>.openai.azure.com/openai/v1` (not `…/chat/completions`) and `E2E_VISION_MODEL=openai/<deployment>` (e.g. `openai/gpt-5.3-chat`).
2. Put your regenerated key in `OPENAI_API_KEY` only in `cloud-llm.env` — never commit it.
3. Run:

```bash
source activate.sh
yarn test:cloud-llm
```

**Desktop manual check** (same env vars must exist **before** you click Start — Tauri does not write `OPENAI_API_BASE` for you):

```bash
set -a && source cloud-llm.env && set +a
# Settings → LLM model: openai/<model> (not ollama_chat/…)
# Turn off “Manage local LLM” if you only want cloud → Save → Chat → Start
```

Playwright cloud UI tests are not wired yet; use `yarn test:cloud-llm` for API-level smoke, then dogfood in the app.

| Workspace | Use |
|-----------|-----|
| `e2e/fixtures/hello-workspace` | Smoke LLM (`hello-llm`, `agent-llm`) — **no** files in context |
| `e2e/fixtures/context-workspace` | Context LLM (`context-llm`, `test_context_llm`) — `/add src/e2e_widget.ts`, assert `E2E_CONTEXT_MAGIC` |
| `e2e/fixtures/edit-block-workspace` | Edit LLM (`edit-block-llm`, `test_edit_block_llm`) — SEARCH/REPLACE on `src/patchme.ts` |
| `e2e/fixtures/integration-workspace` | Real core HTTP (`yarn test:e2e:integration`) — todos/import, not chat context |
| BrightVision repo root | Superproject LLM only when `E2E_SUPERPROJECT_LLM=1` — Vision API: session + README in `files`, one message with `preproc: false` (avoids UI slash preproc + active-task inject) |

Do **not** use the BrightVision superproject as the default LLM `workingDir` (slow repo map, flaky).

For larger regression packs, prefer a small pinned fixture repo (or submodule) and set `E2E_FIXTURE_PACK_ROOT` so `hello-workspace` / `context-workspace` resolve from that external pack.
When `e2e/fixture-pack` exists (submodule), LLM/integration fixture resolution prefers it automatically; set `E2E_FIXTURE_PACK_ROOT` only to override.

Validate the fixture-pack layout (and show submodule pin status when applicable):

```bash
yarn test:e2e:fixtures
# or:
sh scripts/verify-e2e-fixture-pack.sh /absolute/path/to/my-fixture-pack
```

Tip: when your repo is reachable by multiple mount aliases (`/Users/...` and `/Volumes/...`), pass a canonical path:

```bash
E2E_FIXTURE_PACK_ROOT="$(cd /path/to/my-fixture-pack && pwd -P)" yarn test:e2e:fixtures
```

Default `yarn test:e2e` **does not** run `hello-llm.spec.ts`, `agent-llm.spec.ts`, `context-llm.spec.ts`, or `e2e/integration/*`.

### Real core integration (no mocked Vision API)

Spawns **live** `bright-vision-core` on `:8741`; Vite preview **proxies** `/api/core` (no `installMockCoreApi`). **Ollama not required.**

```bash
source activate.sh
yarn test:e2e:integration
# or: sh scripts/test-local.sh integration
```

See [e2e/ROADMAP_COVERAGE.md](../e2e/ROADMAP_COVERAGE.md#real-core-integration-no-mocked-apicore).

`/agent` LLM tests use a strict no-tools prompt; local models may need **6–10+ minutes** (slash preproc default 300s + Ollama). Playwright timeout **15m** on `agent-llm.spec.ts`. Prefer `yarn test:llm:core` for a faster API-level check of `/agent` + `verbose`.

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
