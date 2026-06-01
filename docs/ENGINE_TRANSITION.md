# Engine integration checklist

> **Day-to-day layout:** [UPSTREAM_CECLI.md](./UPSTREAM_CECLI.md). **Regression gate:** [FUNCTIONALITY_CHECKLIST.md](./FUNCTIONALITY_CHECKLIST.md).

| Piece | Where | GitHub |
|-------|--------|--------|
| **Cecli** (agent) | Submodule `cecli/` | [Digital-Defiance/cecli](https://github.com/Digital-Defiance/cecli); track [dwash96/cecli](https://github.com/dwash96/cecli) |
| **Vision HTTP layer** | `bright_vision_core/` in **this repo** | Same repo as BrightVision desktop |
| **Desktop shell** | `src/`, `src-tauri/` | [Digital-Defiance/BrightVision](https://github.com/Digital-Defiance/BrightVision) |

---

## Target tree (parent repo)

```text
BrightVision/
  cecli/                          # git submodule → Digital-Defiance/cecli
  bright_vision_core/             # HTTP/SSE, session, git_workspace, todos
  scripts/vision_serve.py         # thin wrapper → bright_vision_core.vision_serve
  pyproject.toml                  # package bright_vision_core; depends on cecli
  tests/core/                     # pytest (moved from BrightVision-core/tests/basic/)
  activate.sh                     # pip install -e cecli + -e .
  src/  src-tauri/  docs/        # unchanged role
```

**Console script (keep for compatibility):** `bright-vision-core-serve` → `bright_vision_core.cli_serve:main` (PyPI name can stay `bright-vision-core` for the Vision layer only, or rename later to `bright-vision-api`).

---

## Phase 0 — Freeze & verify (no code loss)

Do this **before** deleting or renaming anything.

```bash
cd BrightVision-core
git checkout main
git tag archive/pre-cecli-split-$(date +%Y%m%d)   # optional safety tag
git push origin archive/pre-cecli-split-$(date +%Y%m%d)  # when ready

# Inventory cecli delta vs upstream (should be 2 files + website excluded)
git fetch upstream
git diff --name-only upstream/main HEAD -- cecli/ | grep -v website

# Gate: Vision layer tests
pip install -e .
python -m pytest tests/basic/test_http_api.py tests/basic/test_git_workspace.py \
  tests/basic/test_workspace_todos.py tests/basic/test_http_session_todos.py -q

# Parent shell
cd .. && yarn test:local && yarn test:bright-core
```

**Checklist:** [FUNCTIONALITY_CHECKLIST.md](../BrightVision-core/docs/FUNCTIONALITY_CHECKLIST.md)

**Submodule pin:** Parent must **not** point at `pr/brightvision-cecli-only` (no `bright_vision_core`). Use `BrightVision-core` **`main`** until Phase 3 completes.

---

## Phase 1 — Upstream PR (cecli hunks only)

**Purpose:** Land `cecli/commands/add.py` and `cecli/models.py` on `dwash96/cecli` so we can drop vendored diffs.

### 1a. Create / sync `Digital-Defiance/cecli`

If the repo is new or empty:

```bash
# From a clean clone of dwash96/cecli
git clone https://github.com/dwash96/cecli.git /tmp/cecli-upstream
cd /tmp/cecli-upstream
git remote add digital https://github.com/Digital-Defiance/cecli.git
git push digital main

# Or from BrightVision-core (export only cecli/ tree)
cd BrightVision-core
git subtree split --prefix=cecli -b export-cecli-only   # one-time
# push export-cecli-only to Digital-Defiance/cecli main
```

If `Digital-Defiance/cecli` already exists: add `upstream` → `dwash96/cecli`, merge/rebase regularly.

### 1b. Open PR to upstream

```bash
cd /path/to/Digital-Defiance/cecli   # or BrightVision-core with only cecli/
git fetch upstream
git checkout -B pr/brightvision-cecli-only upstream/main
# cherry-pick or checkout the two files from BrightVision-core main:
git checkout BrightVision-core/main -- cecli/commands/add.py cecli/models.py
git commit -m "Improve /add ignore feedback and Ollama keep_alive defaults"
git push -u origin pr/brightvision-cecli-only
```

**Open PR:** base `dwash96/cecli` `main` ← head `Digital-Defiance:pr/brightvision-cecli-only`

Body: [BrightVision-core/docs/PR_UPSTREAM_CECLI_BODY.md](../BrightVision-core/docs/PR_UPSTREAM_CECLI_BODY.md)

**Until merged:** BrightVision dev may use `Digital-Defiance/cecli` `main` with those two commits, or vendored copy under submodule.

---

## Phase 2 — Extract `bright_vision_core` into parent repo

**Do not put `bright_vision_core` in the cecli fork** — that fork is for PRs to upstream cecli only.

```bash
cd /path/to/BrightVision
git checkout -b chore/engine-split-cecli

# Copy Vision layer + tests (adjust if using git mv from submodule)
git -C BrightVision-core archive main bright_vision_core | tar -x -C .
mkdir -p tests/core
git -C BrightVision-core archive main tests/basic | tar -x -C tests/core
# Move tests/core/tests/basic/* → tests/core/ if needed

# Wrapper script at parent
cp BrightVision-core/scripts/vision_serve.py scripts/vision_serve.py

# pyproject.toml at parent (new or merged) — see template below
```

**New parent `pyproject.toml` (minimal sketch):**

```toml
[project]
name = "bright-vision-core"   # PyPI: Vision layer only; rename later if desired
dependencies = [
  "cecli @ git+https://github.com/Digital-Defiance/cecli@<sha>",
  # after upstream merge: "cecli>=…"
  "fastapi", "uvicorn[standard]", ...
]

[project.scripts]
bright-vision-core-serve = "bright_vision_core.cli_serve:main"

[tool.setuptools.packages.find]
include = ["bright_vision_core*"]
```

Run import/tests from parent after `pip install -e .` and `pip install -e cecli`.

---

## Phase 3 — Submodule swap (`BrightVision-core` → `cecli`)

```bash
cd BrightVision
git submodule deinit -f BrightVision-core
git rm BrightVision-core
git submodule add https://github.com/Digital-Defiance/cecli.git cecli
cd cecli && git checkout main && cd ..
git add .gitmodules cecli
```

Update `.gitmodules`:

```ini
[submodule "cecli"]
  path = cecli
  url = https://github.com/Digital-Defiance/cecli.git
```

**Archive:** Mark [Digital-Defiance/BrightVision-core](https://github.com/Digital-Defiance/BrightVision-core) read-only with README pointing here and to `Digital-Defiance/cecli`.

---

## Phase 4 — Wire parent repo (smooth cutover)

| File | Change |
|------|--------|
| `activate.sh` | `DEFAULT_ENGINE_DIR` → parent root `.` or `cecli`; `pip install -e "${ROOT}/cecli"` + `pip install -e "${ROOT}"` |
| `src/ipc/config.ts` | `CORE_ENGINE_DIR` → `.` (repo root for `scripts/vision_serve.py`) |
| `src/App.tsx` | Migrate stored `bright-vision-core` / `BrightVision-core` → `.` |
| `src-tauri/src/main.rs` | `resolve_app_engine`: default path = project root (script at `scripts/vision_serve.py`) |
| `package.json` | `test:bright-core` → `pytest tests/core` from parent |
| `scripts/verify_submodule_workspace.py` | `CORE` = `ROOT / "cecli"`, `SUB_REL` = `bright_vision_core/session.py` at parent |
| `src/components/settings/AgentsSection.tsx` | Links → `dwash96/cecli` or cecli.dev docs |
| Docs / README | Cecli submodule; no “BrightVision-core” as engine brand |

**Local storage migration:** Users with `coreEnginePath: "BrightVision-core"` in settings — normalize on load (same as today for `bright-vision-core`).

---

## Phase 5 — After upstream merges PR

```bash
cd cecli
git fetch upstream && git merge upstream/main   # or rebase Digital-Defiance/main on upstream
# Confirm: git diff upstream/main HEAD -- cecli/  # should be empty (except optional fork-only commits)

cd ..
# pyproject.toml: pin cecli from PyPI or upstream git tag, not full vendor
pip install "cecli>=X.Y" && pip install -e .
```

Drop duplicate `cecli/commands/add.py` and `cecli/models.py` patches from fork when identical to upstream.

---

## Phase 6 — Cleanup

- [ ] Deinit `bright_vision_core` submodule (if still present)
- [ ] Remove `BrightVision-core` from docs, ROADMAP pins, `sync_bright_vision.sh` paths (or repoint to cecli + parent)
- [ ] Update [UPSTREAM_CECLI.md](./UPSTREAM_CECLI.md) milestones U2–U5
- [ ] GitHub: rename BrightVision-core repo description → archived; primary engine link → Cecli
- [ ] Optional: PyPI publish `bright-vision-core` wheel containing **only** `bright_vision_core` with `cecli` dependency

---

## PR fork workflow (ongoing)

| Task | Repo | Branch |
|------|------|--------|
| Cecli feature / bugfix for upstream | `Digital-Defiance/cecli` | `feature/…` → PR to `dwash96/cecli` |
| Vision HTTP / SSE / todos | `Digital-Defiance/BrightVision` | `bright_vision_core/` in parent |
| Desktop UI | `Digital-Defiance/BrightVision` | `src/` |

**Never** mix `bright_vision_core` commits into the cecli fork’s default branch unless intentionally bundling for a short-lived experiment.

---

## Risk: code loss

| Risk | Mitigation |
|------|------------|
| Submodule pinned to PR-only SHA | Pin `main`; run FUNCTIONALITY_CHECKLIST tests |
| Forgot to move `bright_vision_core/` | Phase 0 archive tag on BrightVision-core; copy before `git rm` submodule |
| `vision_serve.py` not found | Parent `scripts/vision_serve.py` + `CORE_ENGINE_DIR=.` |
| Editable install breaks | `activate.sh` installs **both** `cecli` and parent package |
| Open PR not merged yet | Pin `cecli` submodule to fork commit with 2-file patch until upstream release |

---

## Order of operations (summary)

1. **Verify** on `BrightVision-core` `main` (tests + checklist).  
2. **PR** two cecli files via `Digital-Defiance/cecli` → `dwash96/cecli`.  
3. **Move** `bright_vision_core` + tests + `vision_serve` into **BrightVision** parent.  
4. **Swap** submodule to `cecli/` → `Digital-Defiance/cecli`.  
5. **Rewire** activate, Tauri, config, docs.  
6. **After merge**, pin upstream cecli; archive BrightVision-core repo.

Related: [UPSTREAM_CECLI.md](./UPSTREAM_CECLI.md), [CORE_FILE_MERGE.md](./CORE_FILE_MERGE.md), [CECLI_MIGRATION_ROADMAP.md](./CECLI_MIGRATION_ROADMAP.md).
