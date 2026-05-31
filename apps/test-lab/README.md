# BrightVision Test Lab

Separate desktop app for running the full engine confidence suite with live progress, collapsible step logs, and GPU timing.

## Prerequisites

- BrightVision repo with `source activate.sh` (editable `bright_vision_core`)
- `btime` on PATH (Homebrew)
- Optional: `bcpucap` for GPU capture (`gpucap` still works as an alias)
- **Ollama** reachable when **Skip LLM** is unchecked — the orchestrator sets `E2E_LLM=1` on `llm:core`, `e2e:llm`, and `e2e:llm:superproject` (logged as `suite env:` on stderr). You do not need to export it in your shell.
- **`test-local:release`** intentionally runs **mocked** Playwright only (`*-llm.spec.ts` and `integration/` excluded). Real LLM e2e runs in the later **`e2e:llm`** step — seeing ~18 “skipped” LLM tests in release used to mean “wrong step,” not missing env.

## Run

From repo root:

```bash
source activate.sh
yarn install   # required once so @brightvision/test-lab is linked in yarn.lock
yarn test-lab:dev
```

If you see `Package for @brightvision/test-lab@workspace:apps/test-lab not found`, run `yarn install` from the repo root.

CLI (no UI):

```bash
yarn test:everything
# or: bright-vision-test-everything
```

Orchestrator only (for web UI dev):

```bash
bright-vision-test-suite-serve
# http://127.0.0.1:8743/health  (default; override with BV_TEST_ORCHESTRATOR_PORT)
```

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

**Step ETA:** Pending steps show **ETA ~duration** from `.bright-vision/test-everything-timing.json` medians; during a run, **ETC** shows the estimated clock time that step will start.

**GPU chips:** Step summary uses heartbeat samples (ioreg/`nvidia-smi`) while running; `bcpucap`/`gpucap` at step end can read 0% on macOS even when Ollama used the GPU — the UI prefers heartbeat peaks.

**Dock icon:** Separate from main BrightVision. From repo root:

```bash
yarn test-lab:icon path/to/your-1024.png
```

Writes into `apps/test-lab/src-tauri/icons/`. See `apps/test-lab/src-tauri/icons/README.md`.

## Ports

| Port | Service |
|------|---------|
| 8743 | Test suite orchestrator (default; `BV_TEST_ORCHESTRATOR_PORT`) |
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
