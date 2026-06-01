# Core merge: file-by-file (bright_vision_core → bright_vision_core + cecli)

Commits are **not replayable** between `bright_vision_core` and `bright-vision-core` (aider fork vs cecli). Treat each **file** (or cecli `commands/` module) as a merge unit.

## How different is cecli? (honest summary)

They are **cousins**, not renames. Same lineage (aider-style coders + `Commands` + `GitRepo`), but cecli has moved on in a different direction.

| Signal | bright_vision_core | cecli |
|--------|------------------:|------:|
| `.py` files | 97 | 241 |
| Command surface | one `commands.py` | **73** modules under `commands/` |
| HTTP API for the desktop app | **yes** (`http_api.py`, FastAPI) | **no** |
| Superproject + submodule git | **yes** (`git_workspace.py`, `RepoSet`) | **no** (single-repo `repo.py`) |
| Workspace todos / spec jobs | **yes** | **no** |
| Agents / sub-agents / skills / MCP / hooks | minimal | **large** new trees |
| Shared filenames | 56 | 7 byte-identical, **49 differ** |

So:

- **Rsync of the whole tree is a bad plan** — you would paste an outdated aider fork on top of cecli and lose agents, skills, and the new command layout.
- **Rsync of only “Vision-only” files is a mediocre plan** — those files **import** `Commands`, `Coder`, `GitRepo`, etc. from `bright_vision_core`. After copy they must be **rewritten** to use `cecli.*` anyway. That is manual porting, not a one-shot sync.
- **A good plan** — treat cecli as the engine; **add** a thin `bright_vision_core` package (~15 files) and fix imports + any API mismatches (especially `git_workspace` / `RepoSet`, which cecli does not have today).

### What you are really porting

Not “all of bright_vision_core,” but **the integration layer** the outer app was built against:

1. HTTP + SSE (`http_api`, `http_auth`, `vision_serve`)
2. Headless session (`session`, `event_io`, `headless_stdio`)
3. Multi-repo git (`git_workspace`) — **cecli may need this ported as new code**, not merged from cecli
4. Tasks (`workspace_todos`, `todo_*`)
5. Small glue in `main` / `repo` — **hunk merge**, not file replace

Everything else (LLM loop, coders, slash commands) should stay **cecli** unless a diff shows a Vision bugfix you still need.

Regenerate inventory:

```bash
python3 scripts/compare-cores.py
python3 scripts/compare-cores.py --list vision-only
python3 scripts/compare-cores.py --list differ
python3 scripts/compare-cores.py --diff main.py
```

Rough tree stats:

| Bucket | Count | Rule |
|--------|------:|------|
| Only in `bright_vision_core` | 41 | Port if Vision-specific; skip stale prompts |
| Only in `cecli` | 185 | **Keep** — agents, `/merge`, skills, `commands/*` |
| Shared path, identical | 7 | No action |
| Shared path, differ | 49 | **Intelligent merge** — default **cecli wins** unless Vision delta is required |

## Tier 1 — Copy into `bright_vision_core/` (new package beside `cecli/`)

No cecli counterpart. These are what the **outer repo** needs for HTTP/SSE and Tasks.

| File | Notes |
|------|--------|
| `http_api.py`, `http_auth.py` | FastAPI/session API — shell depends on event shapes |
| `session.py`, `vision_runtime.py`, `vision_serve.py` | Turn lifecycle + serve entry |
| `cli_serve.py` | Console script target |
| `git_workspace.py` | Superproject / submodule `RepoSet` |
| `workspace_todos.py`, `todo_*.py` | Tasks tab |
| `headless_stdio.py`, `event_io.py` | No TUI leakage into chat |
| `brand.py` | Align with outer `src/brand.ts` → BrightVision |
| `gui_progress.py` | Progress → activity bar (may hook cecli IO later) |

After copy: rename imports `bright_vision_core` → `bright_vision_core`; wire internals to **`cecli`** for coders/llm/repo.

## Tier 2 — Do not copy; cecli is authoritative

| Area | Why |
|------|-----|
| `cecli/commands/*` (150+ modules) | Replaces monolithic `commands.py` |
| `coders/agent_coder.py`, `sub_agent_coder.py`, … | New agent model |
| `change_tracker.py`, hooks, skills | Not in Vision fork |

**Do not** rsync Tier 2 from bright_vision_core onto cecli.

## Tier 3 — Shared files that differ (merge manually)

Default: **start from cecli**, port **Vision-only hunks** from aider.

| File | Guidance |
|------|----------|
| `main.py` | Large diff (~500+ lines). Identify `BRIGHT_VISION_HEADLESS`, API mode, vision entry — port hunks into cecli `main` or thin `bright_vision_core` wrapper |
| `repo.py` | Vision added submodule/gitlink behavior → merge into cecli `repo.py` or use `git_workspace.py` only |
| `coders/base_coder.py` | Submodule roots, headless progress — diff and take **minimal** Vision patches |
| `io.py`, `args.py`, `repomap.py`, `waiting.py`, `watch.py` | Review per feature; often cecli is ahead |
| `coders/*.py` (implementations) | Prefer **cecli** coders; Vision-only prompt files under `coders/*_prompts.py` in aider tree are usually safe to ignore |

### `commands.py` vs `commands/`

aider has one **`commands.py`**; cecli split into **`commands/`**. Do not copy `commands.py` wholesale. Map each Vision command you still need to the matching cecli module (or add a small `bright_vision_core/commands_bridge.py`).

## Tier 4 — Identical shared files (no work)

`dump.py`, `format_settings.py`, `help_pats.py`, `special.py`, `git_undo.py`, `deprecated.py`, `copypaste.py` — same bytes today; cecli copy is fine.

## Intelligent workflow (per file)

1. **Classify** — Tier 1–4 using `compare-cores.py --list`.
2. **Diff** — `compare-cores.py --diff <path>` or VS Code compare folders.
3. **Decide** — `KEEP_CECLI` | `PORT_NEW` | `MERGE_HUNKS` | `SKIP`.
4. **Implement** on branch in **`bright-vision-core`** repo; commit with message referencing original file, not old SHA.
5. **Test** — `pytest tests/basic/test_http_api.py` after each Tier 1 batch.

Track progress in a checklist (copy table below into PR description).

```markdown
- [ ] http_api.py — PORT_NEW
- [ ] session.py — PORT_NEW
- [ ] git_workspace.py — PORT_NEW
- [ ] workspace_todos.py — PORT_NEW
- [ ] main.py — MERGE_HUNKS (cecli base)
- [ ] repo.py — MERGE_HUNKS or superseded by git_workspace
```

## Relation to rsync script

`scripts/port-vision-core-to-bright.sh` is a **fast Tier 1 bulk copy**. After rsync, still run Tier 3 merges and import fixes (`cecli.*`).

## Outer repo

Stay in place. Only change submodule pointer + `activate.sh` when Tier 1 + HTTP tests pass on `bright-vision-core`.
