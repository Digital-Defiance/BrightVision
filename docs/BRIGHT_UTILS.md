# Bright Utils (dev tools)

Optional CLI tools from [Bright Utils](https://brightutils.digitaldefiance.org), used by BrightVision **Test Lab** and `yarn test:everything`. They are **not** bundled inside the Python engine like `cecli`.

## Capture modes (Test Lab / `test:everything`)

| Mode | When |
|------|------|
| **`bgpucap`** | macOS Apple Silicon (`arm64`) and `bgpucap` on PATH |
| **`btime_only`** | **Dumb mode** — Linux, Intel Mac, CI without bgpucap: wall-clock via `btime` only; heartbeats use psutil/ioreg |
| **`off`** | `SKIP_GPU=1` or `--skip-gpu` |

`btime` is required unless `--skip-time`. bgpucap never runs on unsupported hosts even if the binary is installed.

## bgpucap / gpucap

[gpucap](https://github.com/Digital-Defiance/gpucap) (`bgpucap` on PATH) wraps each suite step with `btime` and reports GPU, CPU, unified memory, and **memory pressure** (Apple Silicon only). The test runner prefers:

1. `BV_GPUCAP_BIN` (explicit path)
2. `.bright-vision/bin/bgpucap` (from `scripts/install-bgpucap.sh`)
3. `bgpucap` or `gpucap` on PATH (Homebrew, `cargo install`)

### Install (recommended)

**Homebrew** (released **0.1.4** with embed API + JSON `schema` 1):

```bash
brew install digital-defiance/tap/gpucap
# or after a prior install:
brew upgrade gpucap
bgpucap --version
```

Repo-local binary (CI clones, no brew):

```bash
source activate.sh
yarn install:bgpucap   # → .bright-vision/bin/bgpucap (cargo install 0.1.4)
```

Optional: build from a checkout:

```bash
export BV_GPUCAP_SRC=/path/to/gpucap
sh scripts/install-bgpucap.sh
```

### Should gpucap live inside this repo?

**No full source vendoring** in `bright_vision_core/` — it is a separate Rust crate with its own release cycle (like `btime`, not like `cecli`).

| Approach | When |
|----------|------|
| **PATH / install script** (default) | Most contributors; pinned `cargo install` or brew |
| **Optional git submodule** `third-party/gpucap` | Teams that hack gpucap + BrightVision together |
| **Symlink / `BV_GPUCAP_SRC`** | Your machine already has `/Volumes/Code/gpucap` |

An optional submodule is fine for Digital Defiance monorepo workflows; CI and new clones should rely on `install-bgpucap.sh` or brew so the parent repo stays lean.

### Embed API (gpucap ≥ 0.1.4)

Rust library (`gpucap` crate): `platform_supported()`, `sample_system()`, `snapshot_json()`, `REPORT_SCHEMA`. For PyO3 later; BrightVision still uses CLI + JSON for step wraps.

### What Test Lab records

With bgpucap ≥ 0.1.4 JSON mode (default):

- GPU / CPU / RAM avg & peak
- **Memory pressure** peak (0–2) — surfaced in UI and timing history
- Optional `bgpucap compare` vs `.bright-vision/baselines/{step}.json` when a baseline exists

Env:

| Variable | Default | Meaning |
|----------|---------|---------|
| `SKIP_GPU` | unset | Skip bgpucap wrap entirely |
| `BV_GPUCAP_METRICS` | `basic,memory-detail,pressure` | Passed to `bgpucap --metrics` (override if needed) |
| `BV_GPUCAP_JSON` | `1` | Use `-f json` with `BV_GPUCAP_METRICS` (Playwright/yarn stdout still streams live; only the final JSON summary line is held back) |
| `BV_SUITE_SHOW_VITE_LOG` | unset | Set `1` to show Vite `[WebServer]` chunk warnings in Test Lab logs |
| `BV_GPUCAP_LEGACY_FMT` | unset | Force old `GPUCAP` tab line |
| `BV_GPUCAP_COMPARE` | `1` | Run `bgpucap compare` when baseline JSON exists |
| `BV_GPUCAP_BASELINE` | `0` | Set `1` to save green-run JSON as baseline per step |

## btime

Required for wall-clock per step. Install via Homebrew Bright Utils tap or [brightdate-rust](https://github.com/Digital-Defiance/brightdate-rust). Default Test Lab / suite output uses civil-time ETC and seconds/minutes; enable **BrightDate timings** in Test Lab (or `yarn test:everything --use-brightdate`) for BD/md durations, BrightDate ETC, and bgpucap `%Ws`/`%Wt` bounds on capture lines.

| Variable | Default | Meaning |
|----------|---------|---------|
| `BV_SUITE_USE_BRIGHTDATE` | unset | `1` when BrightDate display mode is on (ETC/durations as BD/md; `btime --no-color`) |

`start_bd` / `end_bd` from each `btime` step are always parsed and stored in `.bright-vision/test-everything-timing.json` when present; Test Lab shows a **BD start → end** chip on completed steps.

## Related

- [TESTING.md](./TESTING.md) — `yarn test:everything`, Test Lab
- [apps/test-lab/README.md](../apps/test-lab/README.md)
