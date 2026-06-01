# Submodule & multi-repo verification (#19)

Confirm that BrightVision treats the **superproject root** as the workspace and correctly edits files in the parent tree **and** the **`cecli/`** submodule.

**Primary validation is automated** — agents and CI should not depend on manual GUI steps for daily work.

## Prerequisites

```bash
cd /path/to/BrightVision
git submodule update --init --recursive cecli
source activate.sh
```

- Workspace for tests and headless sessions must be the **repo root** (`BrightVision/`), not `cecli/` alone.
- Submodule must be on a real commit: `git -C cecli status`.

## Automated (daily dogfood)

From **superproject** root (after `source activate.sh`):

```bash
yarn dogfood:agent
# or faster preflight only:
yarn dogfood:check
```

This runs, among other checks:

| Check | Proves |
|-------|--------|
| `yarn verify:submodule` | Parent + `cecli/` discovery |
| `tests/core/test_superproject_dogfood.py` | `RepoSet`, `Session.create` on superproject paths |
| `tests/core/test_superproject_integration.py` | Integration-level superproject behavior |
| `yarn test:e2e:integration` | Live `:8741` + workspace fixtures (in `dogfood:gate`) |

```bash
yarn test:git-workspace
yarn test:bright-core
```

`scripts/verify_submodule_workspace.py` checks parent `bright_vision_core/` + `cecli/` submodule discovery.

## Optional: manual GUI checklist (release spot-check)

Use **`yarn tauri dev`** only when validating **native shell** behavior or before a release announcement. Not required when `yarn dogfood:agent` is green.

Settings / welcome workspace = superproject root.

### A. Submodule discovery

- [ ] Start session with workspace = superproject root.
- [ ] `/add bright_vision_core/session.py` (or picker) — file enters context without “not a normal file” on the repo root.
- [ ] `/add cecli/cecli/main.py` — submodule file enters context.
- [ ] Repo map / scan completes without fatal errors (progress bar may run).

### B. Edit inside submodule

- [ ] Ask for a trivial change in cecli, e.g. a comment in `cecli/cecli/main.py` (must be a **tracked** file in the submodule).
- [ ] Model emits SEARCH/REPLACE (or applies via engine); chat shows **Proposed** vs **Applied** correctly.
- [ ] `git -C cecli diff` shows the change on disk when **Applied**.
- [ ] Git tab / `done.edited_files` lists a path under `cecli/`.

### C. Commit scope

- [ ] If auto-commit enabled: commit lands in **submodule** repo when only submodule files changed (or superproject gitlink update — document actual behavior).
- [ ] Undo from UI reverts the last agent commit batch without breaking parent repo.

### D. Parent + submodule in one session

- [ ] `/add` both `src/App.tsx` and `bright_vision_core/http_api.py` (and optionally `cecli/cecli/main.py`).
- [ ] Single turn that touches both trees (or two turns) — both paths editable, no wrong-repo writes.

### E. Regression guards

```bash
yarn dogfood:agent
```

## Failure modes to watch

| Symptom | Likely cause |
|---------|----------------|
| “Skipping … not a normal file” on workspace root | Empty `fnames` wrongly included directory (fixed in session — re-verify). |
| Edits only in chat, not on disk | Proposed SEARCH/REPLACE not applied; confirm / yes / format. |
| Changes in wrong repo | Workspace pointed at submodule only instead of superproject. |
| No submodule in repo map | Gitlink `160000` excluded by design — use `/add` on real files under submodule. |

## Done criteria

- `yarn dogfood:agent` green (or equivalent: `dogfood:check` + `dogfood:gate` + integration when `.venv` exists).
- All sections **A–D** pass on macOS via Vision UI — **optional**, before releases only.

See [DOGFOOD.md](./DOGFOOD.md) for the agent-first self-dev loop.
