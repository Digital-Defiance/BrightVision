# Cecli upstream PR workflow (BrightVision)

Land a **cecli-only** fix in **[cecli-dev/cecli](https://github.com/cecli-dev/cecli)** while keeping **[Digital-Defiance/cecli](https://github.com/Digital-Defiance/cecli) `dev-integration`** dogfoodable the same day.

**Related:** [CECLI_PIN.md](./CECLI_PIN.md) · [UPSTREAM_CECLI.md](./UPSTREAM_CECLI.md)

---

## Quick reference

```text
origin/main  →  pr/<topic>  →  push  →  open PR (GraphQL script)  →  cherry-pick  →  dev-integration  →  pin parent cecli
```

| Step | Command / doc |
|------|----------------|
| Fix remotes (once) | `sh scripts/fix-cecli-submodule-remote.sh` |
| Branch + commit | §1 below — **always from `origin/main`**, never `dev-integration` |
| Open PR to cecli-dev | `sh scripts/cecli-open-upstream-pr.sh pr/<topic> "title" "body"` |
| Dogfood on fork | `git cherry-pick <sha>` onto `dev-integration` (§4) |
| Ship in BrightVision | `git add cecli` in parent repo (§5) |

**Do not** use `gh pr create --head Digital-Defiance:…` — it fails for org-owned forks ([gh/cli#10093](https://github.com/cli/cli/issues/10093)). Use the script or GraphQL in §3.

---

## Remotes (once per clone)

```bash
sh scripts/fix-cecli-submodule-remote.sh
# or manually:
git -C cecli fetch origin upstream
```

| Remote | Purpose |
|--------|---------|
| `origin` | **Digital-Defiance/cecli** — fork; push all branches here |
| `upstream` | **cecli-dev/cecli** — read-only; PR target |

**Do not** open upstream PRs from `dev-integration` — it carries BrightVision-only integration commits upstream will reject.

---

## Branch naming

| Branch | Use |
|--------|-----|
| `pr/<topic>` | **Upstream PR** — branch from `origin/main` (≈ `upstream/main`) |
| `dev-integration` | **Fork integration** — cherry-pick upstream commits here for BrightVision dogfood |

---

## Step-by-step

Replace `<topic>` and commit as you go.

### 1. Branch from upstream-aligned main

```bash
cd cecli
git fetch origin upstream
git checkout -B pr/<topic> origin/main
# implement + test (from BrightVision root)
cd ..
source activate.sh
python -m pytest cecli/tests/tools/test_<relevant>.py -q
cd cecli
git add …
git commit -m "fix(tools): …"
```

### 2. Push PR branch to the fork

```bash
git push -u origin pr/<topic>
```

Note the commit SHA (e.g. `aa628c041`).

### 3. Open PR to cecli-dev

**Preferred — helper script:**

```bash
cd ..   # BrightVision repo root
sh scripts/cecli-open-upstream-pr.sh \
  pr/<topic> \
  "fix(tools): …" \
  "## Summary
- …

## Test plan
- [x] pytest …"
```

Prints the PR URL (e.g. `https://github.com/cecli-dev/cecli/pull/559`).

**Manual GraphQL** (same as the script):

```bash
FORK_ID=$(gh api repos/Digital-Defiance/cecli --jq .node_id)
UPSTREAM_ID=$(gh api repos/cecli-dev/cecli --jq .node_id)
gh api graphql -f query='
mutation($repoId: ID!, $headRepoId: ID!, $headRef: String!, $baseRef: String!, $title: String!, $body: String!) {
  createPullRequest(input: {
    repositoryId: $repoId
    baseRefName: $baseRef
    headRepositoryId: $headRepoId
    headRefName: $headRef
    title: $title
    body: $body
  }) {
    pullRequest { number url }
  }
}' \
  -f repoId="$UPSTREAM_ID" \
  -f headRepoId="$FORK_ID" \
  -f headRef="pr/<topic>" \
  -f baseRef="main" \
  -f title="fix(tools): …" \
  -f body="…"
```

**Web UI fallback:**

1. Open: `https://github.com/Digital-Defiance/cecli/compare/main...pr/<topic>?expand=1`
2. **Create pull request** → change **base repository** to **`cecli-dev/cecli`**, base **`main`**.

Requires `gh auth login` as a user with push access to **Digital-Defiance/cecli**.

### 4. Cherry-pick to `dev-integration` (dogfood)

**After** the PR branch is pushed:

```bash
cd cecli
git checkout dev-integration
git pull origin dev-integration
git cherry-pick <sha>          # SHA from step 1 on pr/<topic>
git push origin dev-integration
```

If cherry-pick conflicts: resolve, `git cherry-pick --continue`, push.

**Do not** merge `pr/<topic>` into `dev-integration` — cherry-pick only the commit(s) upstream should see.

### 5. Pin BrightVision parent (same session)

From BrightVision repo root:

```bash
git add cecli
source activate.sh && pip install -e cecli
yarn verify:submodule            # optional
# commit parent: chore(cecli): pin dev-integration — <one-line why>
```

Restart Vision API after engine changes: **Terminal → Stop / Start**.

---

## Verify before PR

```bash
source activate.sh
python -m pytest cecli/tests/tools/test_<relevant>.py -q
```

Upstream PR should be **one logical commit** on top of `upstream/main`, not a merge from `dev-integration`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| PR not visible on cecli-dev | `gh pr create` likely failed silently — use `scripts/cecli-open-upstream-pr.sh` or GraphQL (§3) |
| `gh pr create --head Digital-Defiance:…` → *No commits between…* | Expected — use script / GraphQL |
| Compare URL on cecli-dev 404 | Use **fork** compare URL, switch base repo in UI |
| Cherry-pick conflict on `dev-integration` | Resolve manually; do not merge whole `pr/<topic>` branch |
| Fix not active after pull | Parent on old submodule SHA — `git add cecli`, `pip install -e cecli`, restart `:8741` |
| Wrong submodule remote | `sh scripts/fix-cecli-submodule-remote.sh` |
| Branched from `dev-integration` by mistake | `git checkout -B pr/<topic> origin/main` then cherry-pick your commit |

---

## After upstream merges

```bash
git -C cecli fetch upstream
git -C cecli checkout main && git merge upstream/main   # fast-forward fork main
git -C cecli checkout dev-integration
# rebase or merge main into dev-integration as usual
```

Drop duplicate cherry-picks once `dev-integration` contains the upstream merge commit.

---

## Example (EditText LIST_PARAMS, 2026-06)

| Item | Value |
|------|--------|
| PR branch | `pr/edit-text-list-params` @ `aa628c041` from `origin/main` |
| Upstream PR | [cecli-dev/cecli#559](https://github.com/cecli-dev/cecli/pull/559) via GraphQL |
| Cherry-pick on fork | `fd968991b` on `dev-integration` |

## Example (ReadRange empty-file hint, 2026-06)

| Item | Value |
|------|--------|
| PR branch | `pr/read-range-empty-hint` @ `227b3437a` from `origin/main` |
| Upstream PR | [cecli-dev/cecli#560](https://github.com/cecli-dev/cecli/pull/560) via GraphQL |
| Cherry-pick on fork | `a4f1f2dcc` on `dev-integration` |
