# Cecli pin policy (BrightVision)

BrightVision is **not** blocked on cecli `main` or on the day a maintainer tags PyPI. The desktop app needs a **known cecli install**; we choose that commit in git.

**Engine split:** [UPSTREAM_CECLI.md](./UPSTREAM_CECLI.md) · cutover steps: [ENGINE_TRANSITION.md](./ENGINE_TRANSITION.md) · releases: [RELEASE.md](./RELEASE.md)

---

## What we depend on

| Layer | Owned by | Ship before upstream `main`? |
|-------|----------|------------------------------|
| Tauri + React | BrightVision parent | Yes |
| Vision HTTP / SSE / todos | `bright_vision_core/` (parent) | Yes |
| Agent loop, `/add`, models, agents | **cecli** (submodule) | **Yes — via pinned SHA** |

We depend on **having a cecli build**, not on cecli’s release calendar.

### Folder layout

```text
BrightVision/
  bright_vision_core/     ← Vision HTTP layer (parent repo only)
  cecli/                  ← submodule: agent only
    cecli/                ← Python package (import cecli)
```

**`cecli/bright_vision_core/` must not exist** — stray copy of the Vision layer inside the submodule. Remove if present:

```bash
rm -rf cecli/bright_vision_core cecli/bright_vision_core.egg-info
```

---

## Three install paths

| Audience | How cecli is installed | Gets unreleased cecli? |
|----------|------------------------|-------------------------|
| **Dev / dogfood** | `source activate.sh` → `pip install -e cecli` from submodule | Yes — whatever SHA is pinned |
| **Clone + CI** | Same submodule SHA after `git submodule update --init cecli` | Yes |
| **PyPI-only** (`requirements-core.txt`, `BRIGHT_VISION_CORE_INSTALL=pypi`) | Transitive `cecli` from published wheels | **No** until PyPI publishes that version |

Default dev path is **editable submodule**, not PyPI `cecli` latest.

---

## Pin rules

1. **Source of truth:** the `cecli` entry in the parent repo (gitlink SHA). Document in PRs: `cecli @ <short-sha> (<branch or tag label>)`.
2. **Integration branches:** when a PR merges to cecli-dev (e.g. `v0.100.1`) before PyPI, pin that branch tip or merge commit — not `main`.
3. **Fork:** [Digital-Defiance/cecli](https://github.com/Digital-Defiance/cecli) **`main` tracks cecli-dev `main` exactly** (fast-forward after upstream merges). Use the fork for open PRs; submodule URL stays `Digital-Defiance/cecli.git`.
4. **Vision-only changes** stay in `bright_vision_core/` — do not copy cecli patches into the parent tree.
5. **After upstream tags PyPI** (e.g. `cecli==0.100.1`): bump submodule to that tag, then align `requirements-core.txt` / `pyproject.toml` when packaging splits (see UPSTREAM_CECLI U3).
6. **Session encryption (PR [#533](https://github.com/cecli-dev/cecli/pull/533))** is in **`v0.100.2+`** as `cecli.helpers.crypto` (not `from cecli import session_crypto`). BrightVision resolves it via `bright_vision_core.cecli_session_crypto`. After syncing the fork: `cd cecli && git pull origin main && cd .. && pip install -e cecli`.

---

## Ship a cecli feature before upstream merges

**Step-by-step (branch off main → PR → cherry-pick to dev-integration):** [CECLI_UPSTREAM_PR.md](./CECLI_UPSTREAM_PR.md) · **Open PR:** `sh scripts/cecli-open-upstream-pr.sh pr/<topic> "title" "body"`

```text
1. Branch on Digital-Defiance/cecli (or cherry-pick into integration branch)
2. Open PR to cecli-dev (cecli.dev)
3. Parent repo: pin submodule to branch tip or cecli-dev integration branch
4. source activate.sh && yarn verify:submodule
5. Commit parent: chore(cecli): pin <label> — <one-line why>
```

Users on that parent commit get the feature via submodule + venv, not via cecli PyPI.

---

## Submodule URL (parent repo)

`.gitmodules` must point at the PR fork only:

```ini
[submodule "cecli"]
  path = cecli
  url = https://github.com/Digital-Defiance/cecli.git
```

There is **no** `Digital-Defiance/bright-vision-core` repo for this submodule. If `git -C cecli remote -v` shows `bright-vision-core.git` on `origin`, fix it:

```bash
git -C cecli remote set-url origin https://github.com/Digital-Defiance/cecli.git
git submodule sync cecli   # from parent root
```

Remotes inside `cecli/` (run once after clone or legacy bundle):

```bash
sh scripts/fix-cecli-submodule-remote.sh
```

| Remote | URL |
|--------|-----|
| `origin` | `https://github.com/Digital-Defiance/cecli.git` |
| `upstream` | `https://github.com/cecli-dev/cecli.git` (maintainer integration / tags) |

## Bump to cecli-dev integration (e.g. v0.100.8 on `dev-integration`)

**`dev-integration`** rebases onto upstream tags (latest: **[v0.100.8](https://github.com/cecli-dev/cecli/releases/tag/v0.100.8)** — MR #578: `/hot-reload` (Vision: quick-command chip + `bright_vision_core/hot_reload.py`), ReadRange token-based previews, EditText `insert` removed, per-agent MCP sets).

```bash
git -C cecli fetch upstream v0.100.8
git -C cecli checkout dev-integration
git -C cecli rebase FETCH_HEAD   # resolve conflicts; skip commits already upstream
git -C cecli push --force-with-lease origin dev-integration
git add cecli   # parent repo
source activate.sh && pip install -e cecli
yarn verify:cecli-spec && yarn verify:cecli-hopper
```

Legacy one-shot bump (e.g. v0.100.1, includes PR #530):

From BrightVision repo root:

```bash
git -C cecli remote set-url origin https://github.com/Digital-Defiance/cecli.git
git -C cecli remote add upstream https://github.com/cecli-dev/cecli.git 2>/dev/null \
  || git -C cecli remote set-url upstream https://github.com/cecli-dev/cecli.git
git -C cecli fetch upstream v0.100.1
git -C cecli checkout FETCH_HEAD   # or: upstream/v0.100.1 after fetch
cd "$(git rev-parse --show-toplevel)"
git add cecli
source activate.sh
yarn verify:submodule
```

`source activate.sh` sets **`PYTHONSAFEPATH=1`** so the parent `cecli/` directory does not shadow the installed `cecli` package.

Optional: run core tests `yarn test:bright-core` and smoke `yarn tauri dev` (Terminal → Start, chat turn).

If `yarn verify:submodule` warns that `bright_vision_core/` is untracked, commit or `git add bright_vision_core/` — cecli only `/add`s tracked files.

Release note template until PyPI ships:

> Engine: cecli integration **v0.100.1** (git pin; includes [#530](https://github.com/cecli-dev/cecli/pull/530) /add + Ollama `keep_alive`). Not cecli `main`.

---

## When you are actually blocked

- Policy is **PyPI-only** with no git dependency in the published wheel.
- Upstream rejects the change and you will not carry a fork branch.
- You need behavior only in cecli but refuse to bump the submodule (then you wait for their tag).

Otherwise: **pin git, ship BrightVision.**

---

## Related

- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — `activate.sh` / `.venv`
- [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md) — dogfood checklist
- Merged upstream PR: [cecli-dev/cecli#530](https://github.com/cecli-dev/cecli/pull/530) → `v0.100.1` integration branch
