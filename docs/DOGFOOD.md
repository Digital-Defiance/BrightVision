# Dogfooding BrightVision (agent-first)

**Dogfood** means BrightVision validates **itself** through the same stack agents use: superproject workspace, `bright-vision-core-serve` on `:8741`, cecli `Session`, optional local Ollama — **without** requiring a human to click Chat/Tasks in the desktop shell.

Humans and Cursor agents share one contract:

| Who | How |
|-----|-----|
| **Agent / CI** | `yarn dogfood:agent` (or `yarn dogfood:gate` with optional `DOGFOOD_LLM=1`) |
| **Human (optional)** | `yarn tauri dev` for native shell spot-checks only |

The desktop app is not the definition of done; the **automated gate** is.

## What “100% dogfood” means

| Layer | Requirement |
|-------|-------------|
| **Workspace** | Repo root (`BrightVision/`), not `cecli/` alone — enforced in `test_superproject_dogfood.py`, integration e2e, LLM fixtures |
| **Engine** | Vision HTTP + cecli (pytest, integration e2e, LLM lanes) — same paths as React → SSE |
| **Model** | Optional for the default gate; `DOGFOOD_LLM=1` runs real Ollama turns when reachable |
| **Validation** | `yarn dogfood:agent` green; friction → failing test or [ROADMAP.md](./ROADMAP.md) row |

## Daily loop (no GUI)

```bash
cd /path/to/BrightVision
git submodule update --init --recursive cecli
source activate.sh
yarn install

yarn dogfood:agent
# Full bar + Ollama when running:
DOGFOOD_LLM=1 yarn dogfood:agent
# Slow superproject-root LLM lane:
DOGFOOD_LLM=1 DOGFOOD_SUPERPROJECT_LLM=1 yarn dogfood:agent
```

**Agents (Cursor, headless scripts):** run the same commands after substantive changes. Do not ask the user to open the UI unless a change is **native-only** (file picker, keychain, DMG).

### What `yarn dogfood:agent` runs

1. **`yarn dogfood:check`** — layout, `verify:submodule`, `yarn test:fast`, core superproject pytest when `.venv` exists, optional Ollama probe  
2. **`yarn dogfood:gate`** — `test-local.sh release` (mocked e2e + bright-core + integration e2e + verify)  
3. **Optional LLM** — when `DOGFOOD_LLM=1` and Ollama is up: `yarn test:llm:core` + `yarn test:e2e:llm` (+ superproject lane when `DOGFOOD_SUPERPROJECT_LLM=1`)

Shorthand:

| Command | Use |
|---------|-----|
| `yarn dogfood:check` | Fast preflight (~20s) |
| `yarn dogfood:gate` | Full gate without LLM |
| `yarn dogfood:agent` | **Default** — check + gate (alias for agent workflow) |
| `yarn test:everything` | **Max bar** — check + release + fixtures + full LLM incl. superproject (see [TESTING.md](./TESTING.md)) |

## One-time machine setup

```bash
yarn dogfood:setup    # local-llm.env + M4-friendly Ollama pulls
# or: cp local-llm.env.example local-llm.env && ollama pull …
```

Ollama is only required for `DOGFOOD_LLM=1`. The default gate does not need a running model.

## Automated coverage map (#19)

| Concern | Automated proof |
|---------|-----------------|
| Superproject + submodule paths | `test_superproject_dogfood.py`, `test_superproject_integration.py`, `yarn verify:submodule` |
| Vision HTTP / todos / agent import | `yarn test:bright-core`, `yarn test:e2e:integration` |
| UI contracts (mocked) | `yarn test:e2e`, `shipped-scenarios.spec.ts` |
| Char-split agent todo → Tasks title | `agent-todo-char-split.spec.ts`, `integration/import-agent-plan.spec.ts` |
| Real local LLM (opt-in) | `yarn test:llm:core`, `yarn test:e2e:llm` |

Manual GUI checklist: [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md) — **release spot-check only**, not daily.

## Agent self-dev scenarios

Copy into an agent session (headless or in-app chat). Prefer driving **`POST /sessions`** + SSE when not using the GUI.

**Smoke (fast tier, read-only):**

> Read `bright_vision_core/session.py` and summarize how `Session.create` sets `fnames` for the workspace root.

**Context + edit (superproject):**

> `/add bright_vision_core/http_api.py` — add a one-line docstring that this is the BrightVision Vision HTTP API. Emit SEARCH/REPLACE only.

**Tasks + spec (core HTTP):**

> Create a workspace todo via API or Tasks, run generate-spec, implement the first implementation task only — assert `.cecli/todos.json` and spec files on disk.

**Post-/agent todo sync:**

> After a turn that calls UpdateTodoList, `POST /workspaces/todos/import-agent-plan` must yield a real title (not `[` from char-split JSON). See `e2e/integration/import-agent-plan.spec.ts`.

## Friction → tests or roadmap

When automated dogfood fails or an agent hits a new blocker:

1. Add a **repro** — pytest, integration spec, or mocked e2e (preferred).  
2. Or add a row to [ROADMAP.md](./ROADMAP.md) with workspace path, file path, model, expected vs actual, layer (UI / Vision HTTP / cecli / Ollama).

**Watch list:** wrong workspace root, proposed vs applied edits, commit in wrong repo, stuck Connecting (`:8741`), asyncio “Task was destroyed” after Stop, char-split `UpdateTodoList` titles.

## Optional: desktop spot-check

Use when you change **Tauri-only** behavior (tray, keychain, native apply, file dialogs, resource overlay):

```bash
yarn tauri dev
```

In the app: project = repo root → **Terminal → Local LLM → Start** → **Terminal → Start**. Spot-check [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md) **A–D** before a release announcement — not before every merge.

## Local LLM on Apple Silicon

See [LOCAL_LLM.md](./LOCAL_LLM.md). Fast + heavy hopper + model router for dogfood under VRAM pressure.

## Related

- [USER_WORKFLOW.md](./USER_WORKFLOW.md) — install paths  
- [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md) — superproject + `cecli/` (automated + optional GUI)  
- [TESTING.md](./TESTING.md) — test pyramid  
- [TESTING_POLICY.md](./TESTING_POLICY.md) — definition of done  
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — stuck session / orphaned API  
