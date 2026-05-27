# Local LLM bench & leaderboard

Public **flex board** for local LLM setup stats (throughput/latency only). No prompts, paths, or per-turn logs.

| Surface | URL / path |
|---------|------------|
| **Bench UI** (CSV → card) | [`/bench/`](https://brightvision.digitaldefiance.org/bench/) on GitHub Pages (`docs/bench/`) |
| **Public leaderboard** (read-only) | [`docs/data/leaderboard.v1.json`](data/leaderboard.v1.json) — same site `#leaderboard` |
| **Submissions** (git) | [`bench-submissions/`](../bench-submissions/) — one JSON file per card |
| **Build script** | [`scripts/build-bench-leaderboard.mjs`](../scripts/build-bench-leaderboard.mjs) |
| **CI** | [`.github/workflows/bench-leaderboard.yml`](../.github/workflows/bench-leaderboard.yml), [`bench-from-issue.yml`](../.github/workflows/bench-from-issue.yml) |

BrightVision **timing CSV** columns are defined in [`src/utils/thinkingStats.ts`](../src/utils/thinkingStats.ts) (`TIMING_STATS_CSV_HEADERS`). The bench page parser should stay aligned when that format changes.

---

## How it works (Pattern C)

```text
User browser (bench page)
  → parses CSV locally, previews card
  → submits via PR (paste JSON) or GitHub issue form

bench-submissions/*.json     ← raw cards in repo (auditable)
        ↓
GitHub Actions
  → stamp submittedBy on merged PRs (from PR author)
  → build docs/data/leaderboard.v1.json (public aggregate)
        ↓
GitHub Pages redeploys docs/  →  /bench/ shows leaderboard
```

- **No accounts** on our side.
- **`displayName`** (“bench nickname”): short public label for the person/card on the wall — **not** the model name (model comes from CSV / the `model` field).
- **`submittedBy`**: set by CI from GitHub (PR author or issue opener), not trusted from hand-edited JSON on merge.
- **`hideGitHubOnWall`**: if `true`, `@login` is omitted from the public leaderboard file only.

---

## Submission schema (v1)

Each file in `bench-submissions/`:

```json
{
  "schemaVersion": 1,
  "displayName": "metal-box-7b",
  "hideGitHubOnWall": false,
  "submittedBy": "octocat",
  "submittedAt": "2026-05-26T12:00:00.000Z",
  "hardware": "apple-silicon",
  "model": "qwen2.5:7b-instruct-q4_K_M",
  "stats": {
    "turnCount": 42,
    "medianTps": 31.2,
    "meanTps": 28.1,
    "p90ResponseMs": 9200,
    "medianResponseMs": 5100,
    "avgThinkSharePct": 15,
    "medianPeakGpuPct": 88
  },
  "provenance": {
    "source": "brightvision-timing-csv",
    "csvTurnsParsed": 42
  }
}
```

**`hardware`** must be one of: `apple-silicon`, `nvidia-desktop`, `nvidia-laptop`, `amd-desktop`, `cpu-only`, `other`.

**Deduping:** one public entry per `(submittedBy, model)` — newest `submittedAt` wins.

---

## Public leaderboard file

[`docs/data/leaderboard.v1.json`](data/leaderboard.v1.json) is **generated — do not hand-edit** except in emergencies.

| Field | Meaning |
|-------|---------|
| `entries[]` | Sorted by `stats.medianTps` descending; rounded metrics; optional `github` |
| `modelFamilies[]` | Coarse rollups for browsing |
| `privacyNote` | Shown in spirit on the bench page |
| `generatedAt` | Last CI build |

---

## Long-term maintenance

### Routine (low effort)

Most weeks: **nothing**. Automation handles:

1. Merged PR touching `bench-submissions/*.json` → stamp `submittedBy` → rebuild leaderboard → push.
2. New issue with label `bench-card` → [`bench-from-issue.yml`](../.github/workflows/bench-from-issue.yml) writes JSON, rebuilds, closes issue.
3. Push to `main` under `docs/**` or updated leaderboard → [Pages deploy](../.github/workflows/pages.yml).

**Your occasional tasks:**

| Task | When |
|------|------|
| **Review PRs** that add/change `bench-submissions/` | Spam, joke stats, impersonation (`submittedBy` should match PR author after CI), invalid JSON |
| **Glance Actions** | Failed `Bench leaderboard` or `Bench card from issue` on `main` |
| **Spot-check** [`/bench/`](https://brightvision.digitaldefiance.org/bench/) | After UI or data pipeline changes |

### When BrightVision timing CSV changes

1. Update `TIMING_STATS_CSV_HEADERS` / export in [`thinkingStats.ts`](../src/utils/thinkingStats.ts).
2. Mirror parser columns in [`docs/bench/bench.js`](bench/bench.js) (comment at top references TS).
3. Run `yarn bench:leaderboard` locally if you changed build rules.
4. Run `node --test scripts/build-bench-leaderboard.test.mjs`.

### When bench rules or schema change

1. Bump `schemaVersion` in script + docs + bench page (breaking change — migrate or reject old files).
2. Update [`validateSubmission`](../scripts/build-bench-leaderboard.mjs) and issue template [`.github/ISSUE_TEMPLATE/bench-card.yml`](../.github/ISSUE_TEMPLATE/bench-card.yml).
3. Rebuild: `yarn bench:leaderboard` and commit, or **Actions → Bench leaderboard → Run workflow**.

### Abuse / bad submissions

- **Revert or delete** offending `bench-submissions/<id>.json` on `main`; CI rebuilds leaderboard on next push.
- **Block repeat spam** via GitHub repo settings (restrict who can open PRs / issues) if needed — no app-level ban list today.
- **Do not** commit raw CSV or chat logs into this repo.

### If CI breaks

```bash
# Local rebuild (from repo root)
yarn bench:leaderboard
git add docs/data/leaderboard.v1.json
git commit -m "bench: rebuild public leaderboard (manual)"
```

Or: **Actions → Bench leaderboard → Run workflow** (`workflow_dispatch`).

**Common failures:**

| Symptom | Fix |
|---------|-----|
| Invalid JSON in `bench-submissions/` | Fix or remove file; validation error names the filename |
| Actions can’t push | Check `GITHUB_TOKEN` / branch protection (bot needs bypass or maintainers merge bot commits) |
| Leaderboard empty after merge | Confirm file is under `bench-submissions/` and ends in `.json` |
| Issue form not creating file | Label must include `bench-card`; check issue workflow logs and required fields |

### Branch protection note

If `main` requires PR reviews, **bot commits** (stamp + leaderboard) must be allowed: either exempt `github-actions[bot]` or merge those commits via maintainer. Two bot pushes per merged bench PR is normal (stamp, then leaderboard).

### Repo size

Submissions are tiny (≈1 KB each). Even thousands of cards stay small. If history matters, occasional squash is optional; not required early on.

### Domain / links

Issue template and bench copy use **brightvision.digitaldefiance.org**. If the Pages custom domain changes, update:

- [`docs/bench/index.html`](bench/index.html) (if hardcoded)
- [`.github/ISSUE_TEMPLATE/bench-card.yml`](../.github/ISSUE_TEMPLATE/bench-card.yml)
- This doc

[`docs/CNAME`](CNAME) controls Pages hostname.

---

## Commands

```bash
yarn bench:leaderboard
node --test scripts/build-bench-leaderboard.test.mjs
```

---

## Related

- [`bench-submissions/README.md`](../bench-submissions/README.md) — contributor-facing submit rules
- Settings timing export & CSV path: [`.bright-vision/timing-history.csv`](../src/theme/thinkingTimingPrefs.ts) default in app prefs
