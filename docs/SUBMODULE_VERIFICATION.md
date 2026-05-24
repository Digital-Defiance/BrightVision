# Submodule & multi-repo verification (#19)

Confirm that Aider Vision can treat **aider-vision** (superproject) as the workspace and correctly edit files inside the **`aider-vision-core`** submodule — not only the parent app tree.

## Prerequisites

```bash
cd /path/to/aider-vision
git submodule update --init --recursive
source activate.sh
```

- Workspace in Settings / welcome must be the **repo root** (`aider-vision/`), not `aider-vision-core/` alone.
- Submodule must be on a real commit (not empty): `git -C aider-vision-core status`.

## Automated

From **aider-vision** root (after `source activate.sh`):

```bash
yarn verify:submodule
# or: python scripts/verify_submodule_workspace.py
```

Core unit + integration tests:

```bash
yarn test:git-workspace
cd aider-vision-core && python -m pytest tests/basic/test_superproject_integration.py -q
```

Synthetic `test_git_workspace.py` covers `RepoSet` mechanics; `test_superproject_integration.py` and `verify_submodule_workspace.py` use the real `aider-vision` → `aider-vision-core` layout.

## Manual checklist

### A. Submodule discovery

- [ ] Start session with workspace = aider-vision root.
- [ ] `/add aider-vision-core/aider_vision_core/session.py` (or picker) — file enters context without “not a normal file” on the repo root.
- [ ] Repo map / scan completes without fatal errors (progress bar may run).

### B. Edit inside submodule

- [ ] Ask for a trivial change in core, e.g. a comment in `aider-vision-core/aider_vision_core/session.py` (must be a **tracked** file in the submodule).
- [ ] Model emits SEARCH/REPLACE (or applies via engine); chat shows **Proposed** vs **Applied** correctly.
- [ ] `git -C aider-vision-core diff` shows the change on disk when **Applied**.
- [ ] Git tab / `done.edited_files` lists a path under `aider-vision-core/`.

### C. Commit scope

- [ ] If auto-commit enabled: commit lands in **submodule** repo when only submodule files changed (or superproject gitlink update — document actual behavior).
- [ ] Undo from UI reverts the last aider commit batch without breaking parent repo.

### D. Parent + submodule in one session

- [ ] `/add` both `src/App.tsx` and `aider-vision-core/aider_vision_core/http_api.py`.
- [ ] Single turn that touches both trees (or two turns) — both paths editable, no wrong-repo writes.

### E. Regression guards

```bash
yarn audit:core
python aider-vision-core/tests/basic/test_vision_runtime.py -q   # if present
```

## Failure modes to watch

| Symptom | Likely cause |
|---------|----------------|
| “Skipping … not a normal file” on workspace root | Empty `fnames` wrongly included directory (fixed in session — re-verify). |
| Edits only in chat, not on disk | Proposed SEARCH/REPLACE not applied; confirm / yes / format. |
| Changes in wrong repo | Workspace pointed at submodule only instead of superproject. |
| No submodule in repo map | Gitlink `160000` excluded by design — use `/add` on real files under submodule. |

## Done criteria

- `yarn verify:submodule` and `test_superproject_integration.py` pass (automated baseline — **done** May 2026).
- All sections **A–D** pass on macOS via Vision UI (manual regression before releases).
- Any failures filed as bugs with repro steps.

## References

- [ARCHITECTURE.md](./ARCHITECTURE.md) — superproject + `RepoSet`
- [IPC.md](./IPC.md) — workspace on `POST /sessions`
- [USER_WORKFLOW.md](./USER_WORKFLOW.md) — “Hack on Aider Vision itself”
