# BrightVision Test Lab

Separate desktop app for running the full engine confidence suite with live progress, collapsible step logs, and GPU timing.

## Prerequisites

- BrightVision repo with `source activate.sh` (editable `bright_vision_core`)
- `btime` on PATH (required for step timing unless **Skip time**)
- Optional: `bgpucap` on **Apple Silicon** for GPU/RAM/pressure (`sh scripts/install-bgpucap.sh`). On Linux/Intel Mac the suite uses **btime-only** dumb mode automatically. See [docs/BRIGHT_UTILS.md](../../docs/BRIGHT_UTILS.md).
- **Local LLM** reachable when **Skip LLM** is unchecked — **Ollama** or **LM Studio** via `local-llm.env` (`BRIGHTVISION_LLM_BACKEND=lmstudio`, model keys from `lms ls --json`). Lab warmup runs `scripts/local-llm-warmup-for-tests.sh` (`lms load -y` + chat probe on `:1234/v1` for LM Studio). The orchestrator sets `E2E_LLM=1` on `llm:core`, `e2e:llm`, and `e2e:llm:superproject` (logged as `suite env:` on stderr, including `BV_COMPACT_SPEC_GEN=1` and `LLM_SPEC_GEN_TIMEOUT_S=1800`). Same behavior as `yarn test:everything`; no separate Lab-only LLM path.
- **LLM spec-gen in Lab:** shorter prompts (`BV_COMPACT_SPEC_GEN=1`). Default **Run suite** = all-layers only (~1 min on `e2e:llm`). **Optional diagnostic lanes** (checkboxes): phased spec-gen (`E2E_SPEC_GEN_PHASED=1`), model router e2e, cloud LLM smoke (`cloud-llm.env`), **`verify:ears`**, shipped scenario matrix, strict phased pytest. **Enable all lanes** (or tick every optional box) also runs **`verify:cecli-pre-commit`**, **`yarn test:vision-client`** + **`yarn test:suite-client`**, **`pytest:engine-extra`** (remaining `tests/core/` modules), and **`eval:prompts`** (fast 3b, before `llm:core`; **skips** instead of failing the suite when LM Studio is wedged). **Not in Lab:** Expo Remote app, manual Tauri GUI spot-checks ([SUBMODULE_VERIFICATION.md](../../docs/SUBMODULE_VERIFICATION.md)), cloud LLM without `cloud-llm.env`, router lane without distinct fast/code tags.
- **Default suite** always runs **`dogfood:check`**, **`verify:cecli-spec`**, **`verify:cecli-hopper`**, **`llm:backends`**, **`test-local:release`** (mocked e2e + `test:bright-core` + integration + `verify:submodule`), **`e2e:fixtures`**, then LLM steps when a backend is reachable. **Implement envelope:** mocked contracts in release, **`test_implement_llm.py`** in `llm:core`, **`implement-llm` / `implement-resume`** in default `e2e:llm` (Lab injects `E2E_CODE_MODEL`). **`implement-auto-advance`** is opt-in (checkbox or `--implement-auto-advance-llm`).
- **`test-local:release`** intentionally runs **mocked** Playwright only (`*-llm.spec.ts` and `integration/` excluded). Real LLM e2e runs in the later **`e2e:llm`** step — seeing ~18 “skipped” LLM tests in release used to mean “wrong step,” not missing env.

## Run

From repo root:

```bash
yarn lab
# or: source activate.sh && yarn test-lab:dev
```

`yarn lab` runs `scripts/lab.sh` (venv + orchestrator port + **Tauri dev window**). First run may need `yarn install` if the workspace link is missing.

If you see `Package for @brightvision/test-lab@workspace:apps/test-lab not found`, run `yarn install` from the repo root.

CLI (no UI):

```bash
yarn test:everything
# or: bright-vision-test-everything
```

Orchestrator only (for web UI dev):

```bash
yarn test-lab:orch
# or: bright-vision-test-suite-serve  →  http://127.0.0.1:8743/health
```

**Resume:** After a failed or cancelled run, **Resume from …** skips earlier steps (same plan + lane checkboxes). Each step row has a ▶ control to **Run from here**. CLI: `bright-vision-test-everything --from-step llm:core`.

## Full transcript

Enable **Save full transcript to disk** before **Run suite**. Logs are written under:

`.bright-vision/test-suite-runs/run-<timestamp>-<id>.log`

Override path with env `TEST_EVERYTHING_LOG` (repo-relative or absolute). CLI: `yarn test:everything -- --logged`.

### Agent digest (fix failures with Cursor)

Full transcripts repeat `… still running` every 10s and blow past context limits. Use a **collapsed digest** instead:

1. Run with **Save full transcript to disk** checked.
2. After the run, click **Copy agent digest** (or CLI below).
3. Paste into a new Cursor chat with: *“Fix the failures in this Test Lab run”* and attach BrightVision as the project.

CLI (from repo root):

```bash
yarn test-lab:digest .bright-vision/test-suite-runs/run-YYYYMMDD-HHMMSS-xxxxxxxx.log
# optional: -o /tmp/digest.txt  --max-chars 80000
```

The digest collapses heartbeat lines, keeps pytest failures, and truncates to ~120k chars by default.

**Step ETA / ETC:** Pending steps show **ETA ~duration** and **ETC** (clock time) from `.bright-vision/test-everything-timing.json` medians. The **running** step shows **~Xm left**, **ETC** (step finish), and **Run ETC** (whole suite finish). The progress bar repeats step and run ETC while a step is active.

**Mobile alerts (ntfy):** Expand **Mobile alerts (ntfy)** before a run. Enable notifications, scan the QR code with the [ntfy](https://ntfy.sh) Android app (or paste the topic). A push is sent when the **full suite** finishes (pass/fail, wall time, failed step ids — no log text). Use **Test ping** to verify delivery.

**Lab Remote (phone progress):** Expand **Lab Remote (phone progress)** and enable **LAN proxy**. Scan the QR with **BrightVision Lab Remote** (`yarn lab-remote:dev` + Expo Go on the same Wi‑Fi). Shows live step and sub-step status — not log lines.

**Resource chips:** Step summary uses heartbeat samples (ioreg/`nvidia-smi`, `vm.memory_pressure`) while running; `bgpucap` JSON at step end adds RAM %, **memory pressure** (0–2), and swap. End-of-step GPU can read 0% on macOS even when Ollama used the GPU — the UI prefers heartbeat GPU peaks when higher.

**Dock icon:** Separate from main BrightVision. From repo root:

```bash
yarn test-lab:icon path/to/your-1024.png
```

Writes into `apps/test-lab/src-tauri/icons/`. See `apps/test-lab/src-tauri/icons/README.md`.

## Ports

| Port | Service |
|------|---------|
| 8743 | Test suite orchestrator (default; `BV_TEST_ORCHESTRATOR_PORT`) |
| 8744 | Lab Remote LAN proxy → :8743 (Test Lab settings) |
| 8742 | Main app LAN remote proxy → :8741 (not Test Lab) |
| 8741 | Main BrightVision Vision API (may be restarted by integration/LLM e2e steps) |
| 1421 | Test Lab Vite dev UI (`apps/test-lab`; change in `package.json` if needed) |

Quit main BrightVision before LLM/integration tiers if you need uninterrupted chat on :8741.

## Troubleshooting

**Port override:** `BV_TEST_ORCHESTRATOR_PORT=8750 yarn test-lab:dev` (must match for standalone `yarn test-suite:serve`).

**Stale orchestrator / spawn errors:** Quit Test Lab, reinstall the engine, free the port:

```bash
lsof -ti tcp:8750 | xargs kill 2>/dev/null  # or 8743 if default
source activate.sh && pip install -e .
yarn test-lab:dev
```

If stderr shows `unrecognized arguments: --host`, the fallback was pointing at the suite **CLI** instead of the **HTTP server** — update Test Lab and ensure `pip install -e .` (creates `.venv/bin/bright-vision-test-suite-serve`).

Test Lab replaces stale orchestrators automatically when `/health` lacks `"runsEnabled": true`.
