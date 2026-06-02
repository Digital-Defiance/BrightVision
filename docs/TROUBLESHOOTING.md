# Troubleshooting BrightVision

## Local LLM / Ollama

See **[LOCAL_LLM.md](./LOCAL_LLM.md)** for the full setup (Ollama + built-in Local LLM in the desktop app).

**Quick checks:**

```bash
curl -s http://127.0.0.1:11434/api/tags   # Ollama up?

**Desktop:** Settings or Terminal → Local LLM → **Ping stack** (1-token generate + Vision API `/health`, no repo edits).
```

- **Settings → LLM model** must use the LiteLLM form `ollama_chat/<tag>` where `<tag>` matches `ollama list` / `DATA_MODEL` in local-llm.
- **Settings → Ollama API base** — leave empty for default; set if Ollama is not on the default host (same URL as `OLLAMA_HOST` in local-llm).
- **Model router from env** — `FAST_MODEL`, `HEAVY_MODEL`, `MODEL_ROUTER` in `local-llm.env` apply after **Settings → Sync from env files** (or fill-empty hopper slots on launch). Tags are bare Ollama names; heavy tier falls back to `DATA_MODEL` when `HEAVY_MODEL` is omitted. See [LOCAL_LLM.md](./LOCAL_LLM.md#dynamic-model-tiering-39).
- **Ping: “LLM OK · Vision API not running”** — Ollama works; start **Terminal → Start** so the Vision API listens on `:8741` ([LOCAL_LLM.md](./LOCAL_LLM.md#ping-status-llm-ok-and-vision-api-not-running)).
- **Stuck at “Starting Local LLM” (~10%) with model router on** — older builds pulled every hopper model at once; current builds pull only resolved `FAST_MODEL` / `HEAVY_MODEL` tags. Rebuild the app, **Sync from env files**, ensure both tags are pulled (`ollama list`), then **Start** again.
- Cloud models: use `openai/…` / `anthropic/…` and set `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` in the environment **before** launching the app.

## `/agent` timed out after 300s

**Cause:** Older builds applied a **5-minute wall-clock cap** to all slash preprocessing, including `/agent`. Agent mode runs its full tool loop inside that phase, so legitimate work on a local model often exceeded 300s.

**Current behavior:** `/agent` (and `/ask`, `/code`, `/architect`, … with a prompt) has **no default preproc cap** — use **Stop** to cancel. Fast commands (`/add`, `/clear`, …) still use `VISION_SLASH_PREPROC_TIMEOUT_S` (default 300s).

**Optional limits** (set before launching the app or in the environment passed to `bright-vision-core-serve`):

| Variable | Default | Meaning |
|----------|---------|---------|
| `VISION_AGENT_PREPROC_TIMEOUT_S` | `0` (off) | Max seconds for `/agent` and other long mode slash preproc; `0` = unlimited |
| `VISION_SLASH_PREPROC_TIMEOUT_S` | `300` | Max seconds for other slash / preproc work |

Restart the Vision API after changing env vars (`Terminal → Stop` / **Start**).

## `/agent` showed a shell command but nothing ran (turn ends Ready)

**Symptoms:** The agent writes prose plus a markdown code block like ` ```bash find … ``` `, status goes **Ready**, and there is no **Shell** tool output or observation. Or the turn ends in **~1s** with **no assistant bubble**, empty `assistant_text` in debug export, and only `Running slash commands…` before `done`.

**Cause:** Local models sometimes emit shell commands as markdown instead of Cecli agent tool calls. A pending **Add file to the chat?** confirm can also block work on older builds. **Instant empty `/agent`:** when Tasks injects a checklist **above** the `/agent` line, cecli only runs slash commands when the message **starts with** `/` — injected text prevented `/agent` from running at all (fixed by `synthetic_slash_preproc_input`). **False 300s timeout on `/agent`:** the same injection made Vision apply `VISION_SLASH_PREPROC_TIMEOUT_S` instead of the unlimited agent default — fixed by resolving the slash from the raw message / `agent_cmd` flag.

**Current behavior:**

- **`/agent` auto-approves** routine confirms (e.g. **Add file to the chat?**) during the agent preproc phase — including when the model mentions `Cargo.toml` inside a markdown shell block.
- The desktop UI also auto-answers confirms for the duration of an **`/agent`** turn.
- If the turn finishes with a prose shell block and **no tool activity**, Vision emits an orange **tool_warning** explaining the dead end and suggesting retry/nudge.
- **Read-only recovery:** when the model writes a safe exploration command in a markdown shell block (`find`, `ls`, `git status`, …), Vision auto-runs it and appends the output to the turn (requires restarted core). Look for **Recovered prose shell (read-only)** in the activity log.
- **Auto-continue:** when cecli runs that shell and adds output but `/agent` stops before analyzing (common with local models), Vision automatically sends one follow-up `/agent continue` turn in the same session.

**If recovery still did not run** (debug export shows prose shell, `tool_invocations: []`, no **Recovered prose shell** and no orange warning): an older core could finish the turn on the main chat path instead of the `/agent` finalize path — reinstall with `pip install -e .`, kill `:8741`, Stop/Start. `agent_turn_features` in `/health` is a capability flag; all listed features must be in the running `session.py` / `event_io.py` build.

**What to do:**

1. Retry with a short nudge: “Use the shell tool to run that find command.”
2. Answer any pending confirms in the chat if you still see them.
3. Ensure **Engineer / heavy** model is loaded (`/agent` forces heavy when model router is on).
4. Restart **bright-vision-core-serve** after pulling fixes so auto-yes and warnings apply.

**Desktop rebuild is not enough:** Tauri starts `.venv/bin/bright-vision-core-serve` from the **engine install root**, not your open project (`brightdate-rust`). After pulling engine fixes run:

```bash
cd /Volumes/Code/BrightVision   # your BrightVision repo
source activate.sh
pip install -e .
```

Then **Terminal → Stop** / **Start**. If Start still reuses an old listener, kill the orphan:

```bash
lsof -ti :8741 | xargs kill -9
```

Verify the running API:

```bash
curl -s http://127.0.0.1:8741/health | python3 -m json.tool
```

You should see `"agent_turn_features": { "prose_shell_recovery": true, ... }`. If that key is missing, the stale server is still bound to `:8741` (BrightVision now auto-replaces it on Start when the desktop app is rebuilt with the latest Tauri shell).

## Stuck on “Sending” / no assistant reply

The header can show **Sending** while the turn timer runs (**Waiting for model** above the chat input). That usually means **Cecli** is waiting on Ollama, not that the UI is frozen.

1. In a terminal: `ollama ps` — if **UNTIL** is a few minutes (not indefinite), the model will unload and the next turn can hang. Run **Terminal → Local LLM → Start** (preload with `keep_alive: -1`) or **Refresh** (re-applies `-1` without a full restart). For all Ollama clients, you can also set `OLLAMA_KEEP_ALIVE=-1` before starting `ollama serve`.
2. **Chat → `/ps`** — shows `/api/ps` in a table (models in RAM). Use **`/tags`** for pulled models or **`/models`** for both. Does not start a chat turn (safe while GPU is busy).
3. **Settings → Ping stack** — must succeed before chatting.
4. **Stop** the turn, fix Ollama, send again.

**Thinking timer:** **Settings → Thinking timers → Live Response / Think timer** must be on. Timers appear in the **top activity bar** (next to **Sending** / **Thinking**): **Response** from **Send** until done; **Think** for Thinking/Reasoning sections only.

## Answer shown but “Thinking” / queued `/add` never runs

The chat can show a full **Answer** while the header still says **Thinking** or **Waiting for … ollama_chat/…** and **N queued** stays put. That usually means the Vision API turn never sent `done` (often Ollama unloaded the model — empty `/api/ps` — or **Cecli** is still doing repo work).

**False “Turn stalled” at ~90s:** Local turns often take longer. The UI used a 90s SSE idle limit while Vision API progress events were buffered but not streamed. Rebuild **both** the desktop app and restart **bright-vision-core-serve** so you get 15-minute SSE limits and ~8s progress pulses on the wire. The orange “likely stuck” hint is advisory only (about 5 minutes without events).

**What to do:**

1. **Settings → Local LLM → Refresh** — check **/api/ps**; if your model is missing, run **Start** or `ollama run <tag>` / **Ping stack**.
2. **Stop** the current turn, then **Ping stack**, then retry.
3. Prefer **Add all** on the suggested-files tray (uses the files API and does not wait for the stuck turn). **Queue /add** while a turn is busy now uses the same fast path.
4. If nothing changes for ~90s after the answer appeared, the app aborts the stalled SSE stream and shows an error; use **Clear queue** if you no longer want queued messages.

## “Could not start: Load failed” / `POST /sessions: Load failed` (desktop)

WebKit reports **`Load failed`** when the UI cannot complete a request to `http://127.0.0.1:8741` (connection refused, engine crashed mid-request, or something else still bound to `:8741` that is not your spawned engine). This is **not** an Ollama error — Local LLM can show **ready** while the Vision API still fails.

**Typical causes**

| Symptom | Likely cause |
|--------|----------------|
| Engine log shows `python=.../Users/.../Code/BrightVision` but you work in `/Volumes/Code/...` | Stale install path from an older checkout; app may talk to the wrong tree or a **orphan** on `:8741` |
| `GET /health` OK, **Start** fails on `POST /sessions` | Another process still bound to `:8741` (our spawn exited; something else answered health) |
| Snackbar mentions **wrong Python** / `bright_vision_core` import | Settings → **Python** points at an old venv |
| `curl` works from a terminal but the app does not | App spawned a different interpreter than your shell (`source activate.sh`) |

**Steps**

1. **Terminal → Stop**, then fully **quit** BrightVision and reopen.
2. Free the port if needed: `lsof -ti :8741 | xargs kill -9`
3. From the repo you actually use (e.g. `/Volumes/Code/BrightVision`): `source activate.sh` (note the printed venv path).
4. **Settings → Python** — clear the field or set `<repo>/.venv/bin/python3`. **Save Settings**, then **Start** (newer builds realign stale `/Users/.../Code` paths automatically).
5. Watch the Terminal technical log; newer builds append **Engine log** lines from the spawn (e.g. `ModuleNotFoundError: bright_vision_core`).
6. Confirm the port: `curl -s http://127.0.0.1:8741/health` → `"status":"ok"`, then a quick session:  
   `curl -s -X POST http://127.0.0.1:8741/sessions -H 'Content-Type: application/json' -d '{"workspace":"/path/to/your/git/repo","model":"ollama_chat/<tag>"}'`
7. If you set **Settings → Vision API token**, it must match what the spawned engine receives (or leave both empty).
8. **Open project** must be a real directory; invalid paths fail earlier with a Rust error, not `Load failed`.

Optional: `export BRIGHT_VISION_ROOT=/path/to/BrightVision` before launching the app if you use a non-standard install layout.

**`/add`, `/agent`, Tasks tab, or Stop fail with `Load failed` while Start works:** On macOS desktop, WebKit often breaks `fetch` **POST** to `localhost:8741` even when **GET** `/health` succeeds. Current builds route session chat (SSE), file add/upload, confirm/undo, interrupt, and Tasks CRUD through Tauri/reqwest instead of WebKit. Rebuild the desktop app (`yarn tauri:dev` or your release build) after pulling these fixes.

## “Not on disk” / “Not a file” when adding context

**Cause:** The path is not a real file under **Settings → project folder** (workspace root). Common cases:

- The assistant listed **planned** modules in a design outline (e.g. `` `src/resolver.rs`: BSLP … ``) before those files exist.
- You clicked **Add all** on suggested paths that were never created.
- The project folder points at the wrong git root (paths exist elsewhere on disk).

**What to do:**

1. Dismiss or clear the suggested-files tray chips for paths you have not created yet.
2. Add only files that exist (e.g. `Cargo.toml`, reference trees, `.cecli/specs/.../requirements.md`).
3. After the agent edits spec markdown on disk, the next turn should pick up layers automatically (import into `todos.json` on turn end). If the Tasks panel still shows “(No requirements yet.)”, use **Reload spec from disk** on that task.
4. If auto-commit failed with `attribute_author`, update BrightVision core (`default_headless_args` includes git attribution fields) and restart the Vision API.

**Tasks without spec layers:** Normal checklist tasks inject title + checklist only (no “No requirements yet.” placeholders). Turn off **Tasks → Spec focus** unless you are doing EARS/spec-layer work — that toggle adds spec-focus steering, not basic task tracking.

This is not a `/Volumes` vs `/Users` permission issue when the file truly does not exist at the resolved path.

## Stuck on “Connecting” (desktop)

The activity bar can show **Connecting** to `http://127.0.0.1:8741` while the header says **Stopped** if a **Start** is still in progress or a previous start left the UI in a bad state.

1. Click **Stop** on the Terminal tab — it stays enabled whenever the activity bar shows **Connecting** / **Starting engine** (not only when the session is “live”).
2. Click **Start** again only after Stop finishes; a second Start while connecting will stop the stuck attempt first.
3. If the port is still busy, quit the app fully and reopen it (the desktop app now frees `:8741` on **Cmd+Q** / Quit as of the Tauri `ExitRequested` handler; rebuild if an orphan persists from an older build).
4. Check Terminal → technical log for Python/uvicorn errors from `bright_vision_core-serve`.

## `:8741` still listening after Quit (Cmd+Q)

**Symptoms:** After **Cmd+Q** or Quit from the menu, `lsof -i :8741` still shows `python` / `bright-vision-core-serve`.

**Cause (fixed in current Tauri shell):** Cleanup was hooked only to the window **Close** event and ran in a fire-and-forget async task, so macOS quit could exit before the Vision API child was killed. Reused APIs (healthy orphan on `:8741` with no tracked child) were also left running.

**Fix in app:** Quit now runs `shutdown_vision_api` on `RunEvent::ExitRequested` — kills the tracked serve child, stops LAN remote, then `lsof`/`kill` on the configured API port (same as **Terminal → Stop**).

**If stuck from an older build:** `lsof -ti :8741 | xargs kill -9`, then rebuild the desktop app.

## `No module named 'aider'`

This is almost always a **stale repo-map cache**, not a missing pip package.

Older runs pickled tag data referencing the pre-rename Python package `aider`. Current code uses `bright_vision_core`.

**Fix:**

```bash
source activate.sh
pip install -e bright_vision_core
rm -rf .aider.tags.cache.v*   # in your project workspace
```

Restart the app. Core v5+ auto-purges legacy cache directories on session start.

## TUI progress / `Scanning repo: 0%|` in chat

The desktop app runs core with `BRIGHT_VISION_HEADLESS=1`. Terminal tqdm bars must not write to stderr.

If you see progress text in chat:

1. Ensure submodule core is up to date (`pip install -e bright_vision_core`).
2. Restart the API process (quit and reopen the app).
3. Progress should appear in the **header activity bar**, not chat.

## `cecli` submodule points at `bright-vision-core.git`

Parent `.gitmodules` uses **`Digital-Defiance/cecli` only**. A stale submodule checkout may still have `origin` → `bright-vision-core.git` from the old monolithic bundle.

```bash
sh scripts/fix-cecli-submodule-remote.sh
git -C cecli fetch upstream v0.100.1
git -C cecli checkout upstream/v0.100.1
```

See [CECLI_PIN.md](./CECLI_PIN.md).

## `activate.sh`: `command not found: pip` / python not under `.venv`

Usually a **stale `.venv`** from an old checkout path (e.g. old checkout paths) or macOS `/usr/bin/python3` (3.9) used to create the venv.

```bash
deactivate 2>/dev/null
cd /path/to/BrightVision
source activate.sh   # recreates .venv when activate paths or Python < 3.10
```

Optional: `export BRIGHT_VISION_PYTHON=/opt/homebrew/bin/python3.14` before sourcing if `pick_python` does not find 3.10+.

Set **Settings → Python** to `.venv/bin/python3` or leave blank for auto-detect.

## `uvicorn is required`

```bash
source activate.sh
```

(`activate.sh` installs `uvicorn[standard]`; only run `pip install "uvicorn[standard]"` manually if you skipped activate.)

## `pip install -e .`: `Invalid version: 'v0.2.1-bright1'`

Raw `pip install -e .` without **`SETUPTOOLS_SCM_PRETEND_VERSION`** fails when the repo git tag uses BrightVision’s `*-brightN` suffix (setuptools-scm expects PEP 440).

**Fix:** use `activate.sh` helpers — do not run bare `pip install -e .` from repo root.

```bash
source activate.sh
BV_RESET_PIP=1 yarn vision
```

Or manually: `BRIGHT_VISION_SCM_VERSION=0.2.1.post1 pip install -e .[dev]` (match `package.json` version with `-brightN` → `.postN`).

## Tauri build: `failed to read plugin permissions` under `/Volumes/Code/BrightVision/…`

The `src-tauri/target/` directory has **stale absolute paths** from an old checkout name (old checkout paths, `bright-vision`). Cargo/Tauri then looks for generated files at a path that no longer exists.

```bash
rm -rf src-tauri/target
cd src-tauri && cargo test
# or: yarn test:rust
```

If it persists, check you are not setting `CARGO_TARGET_DIR` to an old project path.

## `cargo` not found (`yarn build:mac`)

Install Rust so `cargo` is on `PATH` (rustup recommended for universal DMG). See [BUILD_MACOS.md](./BUILD_MACOS.md).

## Compatibility audit (developers)

From the repo root:

```bash
python bright_vision_core/scripts/audit_rename_compat.py
pytest bright_vision_core/tests/basic/test_vision_runtime.py -q
```

Run before releases and after large core merges.
