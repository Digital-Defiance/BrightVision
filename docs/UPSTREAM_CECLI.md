# Upstream cecli strategy

**BrightVision** (Tauri + React) talks only to the **Vision API** (`bright_vision_core` HTTP/SSE). The agent is **[Cecli](https://cecli.dev)** — built in **partnership with the Cecli team** ([dwash96/cecli](https://github.com/dwash96/cecli)), installed from the `cecli/` submodule or PyPI.

**Pin policy:** [CECLI_PIN.md](./CECLI_PIN.md) · **Dev setup:** [DEVELOPMENT.md](./DEVELOPMENT.md)

---

## Layout

```text
BrightVision/                    ← desktop app (this repo)
  bright_vision_core/            ← Vision API (FastAPI + SSE on :8741)
  cecli/                         ← submodule → Digital-Defiance/cecli (agent)
  scripts/vision_serve.py        ← Tauri spawn → bright-vision-core-serve
  docs/index.html                ← product site (bright-vision.digitaldefiance.org)

dwash96/cecli (upstream)         ← terminal agent; docs at cecli.dev
```

| Layer | Where | Notes |
|-------|--------|--------|
| UI | `src/`, `src-tauri/` | Never shells interactive `cecli` CLI |
| Vision API | `bright_vision_core/` | Sessions, todos, git superproject, SSE → `src/ipc/events.ts` |
| Agent | `cecli` package | Models, coders, tools, slash commands |
| Product docs | `docs/index.html` | Install, roadmap, onboarding |
| CLI docs | [cecli.dev](https://cecli.dev) | Do **not** edit `cecli/website/` in this repo |

PyPI package name **`bright-vision-core`** is the Vision API wheel (depends on `cecli`). That is not a separate engine brand.

---

## `bright_vision_core` scope

Tier-1 modules ([CORE_FILE_MERGE.md](./CORE_FILE_MERGE.md)):

| Module | Role |
|--------|------|
| `http_api.py`, `http_auth.py` | FastAPI + SSE |
| `session.py`, `vision_runtime.py`, `cli_serve.py` | Turns, `bright-vision-core-serve` |
| `git_workspace.py` | Superproject / submodule `RepoSet` |
| `workspace_todos.py`, `todo_*.py` | Tasks tab |
| `headless_stdio.py`, `event_io.py` | Headless events |
| `brand.py` | Align with `src/brand.ts` |
| `async_bridge.py` | Bridge to `cecli.*` |

Everything else (LLM loop, agents, MCP, skills) lives in **installed `cecli`**.

**Upstream deltas:** Until cecli `main`/PyPI includes our changes, we carry small hunks via the submodule pin (see [CECLI_PIN.md](./CECLI_PIN.md); PR [#530](https://github.com/cecli-dev/cecli/pull/530) on `v0.100.1`).

---

## Daily development

```bash
git submodule update --init cecli
source activate.sh          # editable cecli + bright_vision_core + pytest
yarn tauri dev
```

Optional: `BRIGHT_VISION_CECLI_DIR`, `BRIGHT_VISION_PYTHON`, `BRIGHT_VISION_CORE_INSTALL=pypi` — see [DEVELOPMENT.md](./DEVELOPMENT.md).

---

## Docs map

| Audience | Location |
|----------|----------|
| BrightVision app | `docs/index.html`, [ARCHITECTURE.md](./ARCHITECTURE.md), [IPC.md](./IPC.md) |
| Vision API | `bright_vision_core/README.md` |
| Cecli CLI | [cecli.dev](https://cecli.dev) |
| Tests | `yarn test:bright-core`, `yarn test:e2e:llm` — [TESTING.md](./TESTING.md) |

---

## Milestones

| # | Item | Status |
|---|------|--------|
| U1 | Cecli diff vs upstream (excl. `website/`) | **Done** — `add.py`, `models.py` |
| U1b | Upstream PR for hunks | **Done** — [#530](https://github.com/cecli-dev/cecli/pull/530) / `v0.100.1` |
| U2 | Drop fork-only hunks after upstream merge | Open |
| U3 | `pyproject.toml`: wheel = `bright_vision_core` only; depends on `cecli` | Open |
| U4 | `activate.sh` + CI always on `cecli/` submodule pin | **Done** (dev path) |

---

## Agent instructions

1. **Do not** edit `cecli/website/`.
2. **Do** add Vision-HTTP behavior under `bright_vision_core/`; import `cecli.*` for agent logic.
3. **Prefer** fixing agent bugs upstream in cecli when not HTTP-specific.
4. **Update** [ROADMAP.md](./ROADMAP.md) when milestones change.
