# Multi-repository context (#48)

**Goal:** Multiple git repositories for agent context — `/add`, repo-map (SQLite tags), `/agent`, tools — via **upstream cecli**, not BrightVision-only engine code.

**Strategy:** All repo/registry/repomap/commit routing lands in **cecli** (PR to cecli-dev). BrightVision is a **headless client**: pass workspace config, optional UI, pin submodule until merge.

---

## Upstream-first principle

| Do in **cecli** (upstream PR) | Do in **BrightVision** only |
|-------------------------------|-----------------------------|
| Project registry (`path:` + `repo:`) | Settings UI to edit workspace config |
| `GitRepo` multi-root facade | `POST /sessions` forwards config to cecli |
| `get_tracked_files` / repomap / `/add` / commit routing | Tauri path completion (calls same path rules) |
| Submodule discovery as **optional project source** | `workingDir` = primary project path |
| Tests with generic two-repo fixtures | E2E/dogfood on BrightVision superproject |

**Avoid:** BrightVision-only types (`context_roots`, `.bright-vision/context-repos.json`, extended `RepoSet` in `bright_vision_core`) that duplicate cecli’s workspace model.

**End state:** Retire or thin **`bright_vision_core/git_workspace.py` `RepoSet`** once cecli’s registry covers submodules + local paths. Until then, submodule dogfood keeps working; new multi-repo work does **not** extend `RepoSet`.

---

## What cecli already has (extend this)

Cecli **workspace mode** is the canonical multi-repo design:

- `cecli/helpers/monorepo/` — config, clone, `.cecli-workspace.json`
- Virtual root (`coder.root` = workspace directory)
- Paths `{project}/main/{relpath}` for cloned projects
- `get_workspace_files()` — union of tracked files
- `RepoMap` — one SQLite tag cache under primary `.cecli/`, keys = absolute paths

**Gaps to close upstream:**

1. **`path:`** — local git roots, not only `repo:` clone URLs
2. **Init** — remove `num_repos > 1` hard fail when registry is configured
3. **Per-project git** — commit / dirty / readonly routing on the facade
4. **Submodule layout** — optional: discover `.gitmodules` into project entries (same semantics as today’s `RepoSet`, but inside cecli)
5. **Flat layout** — optional `{project}/{relpath}` without `/main/` when using local `path:`

Config surface (cecli-native, not BrightVision-specific):

```yaml
# .cecli.workspaces.yml (repo-local) or ~/.cecli/workspaces.yml
name: my-workspace
projects:
  - name: app
    path: /abs/path/to/primary
    primary: true
  - name: lib
    path: /abs/path/to/lib
    readonly: true
  - name: upstream-tool
    repo: https://github.com/org/tool.git
    branch: main
```

CLI: existing `--workspace-name` / `--workspaces`.  
Headless (BrightVision): pass equivalent JSON/YAML on session create or ensure cecli loads `.cecli.workspaces.yml` from the primary project root.

---

## Cecli PR plan (`pr/multi-repo-context`)

| Phase | Upstream work | Tests |
|-------|---------------|-------|
| **1** | `path:` in `validate_config`; project registry; union tracked files; fix init gate | Two `GitTemporaryDirectory` siblings; repomap tags both |
| **2** | Per-project commit, dirty, readonly; `/add` + glob on prefixed paths | Commit lands in correct repo |
| **3** | Submodule auto-registration (optional flag) | Superproject + nested submodule fixture |
| **4** | Docs + `cecli website` usage page | — |

Branch: [Digital-Defiance/cecli](https://github.com/Digital-Defiance/cecli) → PR to cecli-dev. Pin: [CECLI_PIN.md](./CECLI_PIN.md).

**Repomap:** Keep one cache dir; absolute-path keys already work; invalidate when **any** project HEAD changes (extend existing SHA cache in `get_workspace_files()`).

---

## BrightVision integration (thin)

1. **Session create** — optional `workspace_config` (or cecli reads `.cecli.workspaces.yml` from `workspace` path). No custom `RepoSet` logic for new features.
2. **Settings (later)** — edit/generate `.cecli.workspaces.yml` in the primary project; not a parallel JSON schema.
3. **Dogfood** — primary = repo root; optional second project via workspace file (e.g. sibling `brightdate-python`).

Do **not** add `bright_vision_core`-only repomap or `/add` behavior.

---

## What exists today (legacy)

| Piece | Status |
|-------|--------|
| **`RepoSet`** in `bright_vision_core` | Submodule-only; **keep for dogfood until upstream absorbs** |
| **Cecli workspace (clone)** | In cecli CLI; not wired through Vision session yet |
| **Single `workingDir`** | UI; maps to primary `projects[].path` |

---

## Non-goals

- BrightVision-specific path prefixes or config files
- Cross-repo atomic commits
- Vision-layer duplicate of repomap indexing

---

## Shipped in this repo (integration branch)

| Piece | Status |
|-------|--------|
| **`path:` projects** in cecli `validate_config` | Done (`cecli/helpers/monorepo/local_workspace.py`) |
| **Repo-local** `.cecli.workspaces.yml` detection | Done (`GitRepo._detect_workspace_path`, `workspace_layout=local`) |
| **Union** `get_workspace_files` + per-project **commit** | Done (local layout: `{project}/{relpath}`) |
| **`create_git_workspace`** | Uses cecli workspace when YAML present (not `RepoSet`) |
| **Vision** `POST /sessions` `workspaces` body | Writes YAML if missing; `workspace_config.py` |
| **Example** | [`.cecli.workspaces.example.yml`](./.cecli.workspaces.example.yml) |
| **Tests** | `tests/core/test_local_workspace.py` |
| **Vision UI** | Settings multi-repo section; header chip when `project_count > 1`; `GET /workspaces/cecli-workspace` |

**Still upstream / follow-up:** open PR on `Digital-Defiance/cecli`; pin submodule; submodule entries inside cecli registry (today: submodules **or** YAML path projects, not both in one `RepoSet`); clone-mode `workspace_name` on session create.

## Suggested fix order

1. **Pin cecli** submodule to fork branch with these commits; open PR to cecli-dev
2. Pin cecli submodule after upstream PR merges
3. Cecli: submodule auto-registration into workspace registry → deprecate `RepoSet`

---

## Related

- [CECLI_PIN.md](./CECLI_PIN.md) — fork branch workflow
- [UPSTREAM_CECLI.md](./UPSTREAM_CECLI.md) — engine ownership
- [IPC.md](./IPC.md) — session create (extend with `workspace_config` only)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — current submodule note
