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

## `/agent` stopped at exactly 1 hour (message back in input, no `done`)

**Symptoms:** Long `/agent` task on a local model runs for ~60 minutes, then the chat stops updating. The send box is prefilled with your last prompt (often `/agent Work the active task checklist…`) but nothing sends. Session debug export ends at `Running slash commands (3600s)` with no `done` or `error` event.

**Cause:** Desktop builds before mid-2026 applied a **1-hour reqwest timeout** on the Tauri SSE transport (`send_vision_message`). The Vision API was still running; the WebKit/reqwest client dropped the stream. The UI restored your outbound text to the input on transport failure.

**Current behavior:** No wall-clock cap on the desktop SSE client (stall detection uses 15-minute idle limits in the UI; use **Stop** to cancel). After a transport drop, partial turns stay in chat; use **Stop** then retry or send **continue**. Rebuild the desktop app after pulling the fix.

**Also check:** If you set `VISION_AGENT_PREPROC_TIMEOUT_S=3600` (or any positive value), the **server** will cap slash preproc and emit a proper `error` + `done` — unset it or set `0` for unlimited agent runs.

## `/agent` showed a shell command but nothing ran (turn ends Ready)

**Symptoms:** The agent writes prose plus a markdown code block like ` ```bash find … ``` `, status goes **Ready**, and there is no **Shell** tool output or observation. Or the turn ends in **~1s** with **no assistant bubble**, empty `assistant_text` in debug export, and only `Running slash commands…` before `done`.

**Cause:** Local models sometimes emit shell commands as markdown instead of Cecli agent tool calls. A pending **Add file to the chat?** confirm can also block work on older builds. **Instant empty `/agent`:** when Tasks injects a checklist **above** the `/agent` line, cecli only runs slash commands when the message **starts with** `/` — injected text prevented `/agent` from running at all (fixed by `synthetic_slash_preproc_input`). **False 300s timeout on `/agent`:** the same injection made Vision apply `VISION_SLASH_PREPROC_TIMEOUT_S` instead of the unlimited agent default — fixed by resolving the slash from the raw message / `agent_cmd` flag.

**Current behavior:**

- **`/agent` auto-approves** routine confirms (e.g. **Add file to the chat?**) during the agent preproc phase — including when the model mentions `Cargo.toml` inside a markdown shell block.
- The desktop UI also auto-answers confirms for the duration of an **`/agent`** turn.
- If the turn finishes with a prose shell block and **no tool activity**, Vision emits an orange **tool_warning** explaining the dead end and suggesting retry/nudge.
- **Read-only recovery:** when the model writes a safe exploration command in a markdown shell block (`find`, `ls`, `git status`, …), Vision auto-runs it and appends the output to the turn (requires restarted core). Look for **Recovered prose shell (read-only)** in the activity log.
- **Auto-continue:** when cecli runs that shell and adds output but `/agent` stops before analyzing (common with local models), Vision automatically sends one follow-up `/agent continue` turn in the same session.
- Auto-continue **does not** run when agent tools already ran (`Tool Call: Local • …`), when Ollama returned an empty response, or on the continue leg itself (one shot only).
- **Token-limit recovery:** when `/agent` stops with **has hit a token limit** or `FinishReasonLength exception`, Vision auto-sends one follow-up `/agent` turn instructing the model to **edit files** instead of repeating grep/ls exploration. Same one-shot rule as shell auto-continue. Regular (non-`/agent`) turns get an orange warning suggesting **continue** or **Clear chat**.

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

## `/add cecli/…` blocked: “matched .gitignore under the session workspace”

**Symptoms:** Dogfooding BrightVision on the superproject repo, the agent asks to `/add cecli/cecli/helpers/responses.py` (or similar tracked submodule paths). Tool error:

```text
Can't add cecli/cecli/helpers/responses.py: matched .gitignore under the session workspace.
If this is normal tracked source, check the project folder in Settings.
```

**Cause:** The `cecli/` submodule uses a root `.gitignore` whitelist (`*` then `!/cecli/**`). Cecli’s ignore check used to resolve repo-relative paths against **process cwd** (superproject root) instead of the **submodule repo root**, so paths like `cecli/helpers/responses.py` were mis-resolved to `BrightVision/cecli/helpers/…` (missing the inner `cecli/`) and falsely matched `*`.

**Fix (engine):** Pull latest cecli submodule + reinstall Vision API:

```bash
cd /path/to/BrightVision
git submodule update --init cecli
source activate.sh
pip install -e .
# Terminal → Stop / Start (or kill :8741 and restart)
```

**Workarounds while on an older build:**

| Approach | When to use |
|----------|-------------|
| **Settings → project folder** = superproject root (`BrightVision/`), not `cecli/` alone | Always — wrong root causes many `/add` failures |
| **Edit cecli in Cursor** (or open the file manually) | Agent can still patch via tools once the path is known; `/add` is only for chat context |
| **Paste file contents** into chat | Quick unblock when `/add` fails |
| **Answer “Add file?” confirms** for parent-tree files (`src/…`, `bright_vision_core/…`) | Submodule adds may still fail until the engine fix is running |

After restart, `/add cecli/cecli/main.py` should succeed (see [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md)).

## Generated implementation tasks disappear after save

**Symptom:** Tasks tab shows “Implementation tasks generated and saved”, then the **Implementation tasks** field is empty (or reverts to a short agent checklist).

**Cause:** After generate-spec, the UI reloads Tasks and **imports the chat session’s Cecli `todo.txt`**. That sync updates the runtime **checklist** but used to **overwrite** spec-generated `tasks_md` (numbered steps, REQ refs, `depends:`).

**Fix (engine):** Agent import now preserves spec-style `tasks_md` when pulling agent plans. Reinstall and restart the Vision API:

```bash
source activate.sh
pip install -e .
# Terminal → Stop / Start (or kill :8741)
```

**Also:** Blurring the tasks field while generation runs could save an empty draft over the result — the Tasks editor now skips auto-save during generation.

## Agent turn dies after “token limit” or “Repetition Detected” (local LLM)

**Symptoms:** Turn stops with `FinishReasonLength exception` or **token limit** even though usage shows ~6k input / **~0 output**. Auto-continue may run, then **Repetition Detected** on `EditText`, and the turn ends with no further progress.

**Also:** Turn runs 10+ minutes with ls/ReadRange/GitStatus, then **Empty response from the local model** and **Repetition Detected** on read tools — chat shows only opening prose and **no auto-recovery**.

**Cause:** Ollama/Qwen often returns `finish_reason=length` with an empty body — not real context exhaustion. Auto-continue then drives a second huge implement pass; the model batches many `EditText` calls (`@000` on a dozen files), triggering cecli repetition guard. Separately, exploration-heavy turns can end when Ollama stalls after read tools with no EditText — often because **Model router → Heavy keep-alive** was **0** (unload 27B between every agent LLM call). Default is now **-1** (keep loaded); existing saved **0** migrates to **-1** on Settings load.

**Current behavior (2026-06):**

- Spurious Ollama token limits (~0 output, input ≪ window) **no longer auto-continue**; snackbar explains the stall.
- **Stalled exploration** with empty Ollama **auto-continues once** only when fewer than four LLM rounds ran with no edits; after that, BrightVision stops with a directive to fix keep-alive and **Implement** one step — avoids looping on empty Ollama.
- Token-limit continue prompts scope to **one numbered task** and **one file per EditText**.
- Prefer **Implement** on step **1.1** only — not open-ended **Start work** for greenfield scaffolding.

**What to do:**

1. **Clear chat**, then **Implement** a single step (e.g. “1.1 Scaffold lib/”).
2. After **ContextManager** creates empty stubs, **EditText one file at a time** — do not batch pubspec + many lib files in one call.
3. If Ollama keeps returning empty: `ollama ps`, restart Ollama, or try a smaller quant.
4. **Repetition Detected** on EditText: send **continue** naming one file — or clear chat and retry one step.

## Agent turn stuck in ReadRange loops (spec-focus implement)

**Symptoms:** Chat shows many `ReadRange` calls on empty `pubspec.yaml`, then **Repetition Detected** / turn stops with no `lib/` or edits.

**Cause:** Spec-focus re-injected the full requirements + design (~12k chars) every turn; the local model explored empty files instead of using `EditText`. Cecli agent repetition guard then blocks further reads.

**Current behavior (2026-06):**

- Full spec inject **once** per task activation (`inject_todo_spec` on first send); follow-up turns get preamble only (spec stays in chat history).
- **Start work** / **Implement step** use a **lean inject** (REQ headings + truncated design + full tasks) and **`/agent`** routing.
- Preamble includes **Implementation turn (tools)** hints: empty file → `EditText` `@000`, not repeated `ReadRange`.
- ReadRange on empty files tells the model to edit next (cecli).

**What to do:**

1. Use **Implement** on a single numbered step (not open-ended “implement everything”).
2. **Clear chat** if the thread is already stuck in a read loop, then **Start work** again.
3. Turn off **Spec focus** for pure scaffolding if you do not need EARS steering every turn.
4. Remove stale root **`STEERING.md`** if it duplicates `.cecli/specs/` (model may fixate on wrong doc).

See [CECLI_UPSTREAM_PR.md](./CECLI_UPSTREAM_PR.md) for cecli fixes; restart Vision API after submodule bump.

## Spec generate timed out (design / requirements / tasks)

**Symptom:** Job runs 20+ minutes, chip says **timed out**, snackbar mentions the minute limit. Debug export shows `status: error`, `section: design` (or requirements/tasks), message like `Spec generation job timed out after 1200s`. The model may have been streaming good content but the job was killed before save.

**Cause:** Background generate-spec has two limits — **whole job wall clock** and **per LLM turn**. Large local models (e.g. 27B Qwen on rich greenfield specs) often exceed the default **20 min job / 12 min per turn**.

**Fix in the app (no Vision API restart):**

1. **Tasks** banner → **Extend & retry** — switches to **Extended (40 min / 20 min per turn)** and reruns the last generate with the same task and prompt.
2. Or **Settings → Spec generation timeouts** → **Extended (40 min)** before the next run.

**Server defaults** (optional env overrides before `bright-vision-core-serve`; restart required):

| Variable | Default | Meaning |
|----------|---------|---------|
| `LLM_SPEC_GEN_TIMEOUT_S` | `1200` | Whole background job wall clock (seconds) |
| `LLM_SPEC_GEN_TURN_TIMEOUT_S` | `720` | Per LLM turn inside generate-spec (seconds) |

Per-run values from Settings override env defaults for that job only. Debug export includes `wall_timeout_s` and `turn_timeout_s` for the failed job.

## Spec generate shows “EARS blocked” (draft not saved)

**Symptom:** Job completes (~10+ min), chip says **EARS blocked**, snackbar: “Spec draft returned but not saved”.

**Not the same as:** the Tasks list **blocked** chip (unfinished dependency tasks) or the Generate button tooltip (session not started / no task selected).

**Debug export:** `job.ears_blocked: true` with a large `requirements_chars` count means the LLM output was fine but **EARS lint** rejected save. Future exports include `job.ears_issues` with the exact errors.

**Common false positive (fixed):** Kiro-style `**User Story:**` lines that contain everyday words like *while* or *if* were parsed as EARS clauses without **SHALL**. Reinstall core after pull.

**Workaround until updated:** **Validate EARS** on the Requirements tab to see errors, edit manually, or **Refine** with “fix EARS errors listed above”.

**Generate without active task:** Select any task in the list — it does **not** need to be the active (★) task. Generation runs against the **selected** task’s id.

## `activate.sh`: `command not found: pip` / python not under `.venv`

Usually a **stale `.venv`** from an old checkout path (e.g. `/Users/.../BrightVision` vs `/Volumes/.../BrightVision`) or macOS `/usr/bin/python3` (3.9) used to create the venv.

`activate.sh` now resolves the repo from **where `activate.sh` lives** (canonical `pwd -P`) and compares venv paths the same way, so dual-path checkouts do not spuriously recreate `.venv`.

If recreate still fails mid-way (no `bin/python3`):

```bash
deactivate 2>/dev/null
cd /path/to/BrightVision    # pick one path and stick to it
rm -rf .venv
source activate.sh
```

Optional: `export BRIGHT_VISION_PYTHON=/opt/homebrew/bin/python3.14` before sourcing if `pick_python` does not find 3.10+.

Set **Settings → Python** to `.venv/bin/python3` or leave blank for auto-detect.

## `yarn vision` / `yarn lab` slow (minutes on activate)

**Expected:** `activate.sh` under launchers is **instant** (~0.2s). Pip runs **once** via `scripts/ensure-venv.sh` only when `.venv` cannot `import cecli, bright_vision_core, uvicorn, pytest`.

**If every launch pip-installs for minutes:**

1. Check imports: `.venv/bin/python3 -c 'import cecli, bright_vision_core, uvicorn, pytest'`
2. If that fails, run once: `source activate.sh` (from repo root, same path as `yarn vision`)
3. Debug path: `BRIGHT_VISION_ACTIVATE_DEBUG=1 yarn vision` — should print `fast: launcher`, not `slow: pip install`
4. Force reinstall after submodule pull: `BV_VISION_SETUP=1 yarn vision`

Partial venv (cecli installed but not `bright_vision_core`) used to re-pip on **every** launch; launchers now skip pip and `ensure-venv` runs setup only when imports fail.

## `verify:ears`: `No module named pytest`

Test Lab / `yarn verify:ears` runs pytest from **repo `.venv`**, not system Python. The error path may show Homebrew `python3.14` even when the venv is used (symlink).

**Fix:** from repo root:

```bash
source activate.sh
yarn verify:ears
```

Or let the script self-heal: `verify-ears.sh` calls `ensure-venv.sh` when pytest is missing. If that still fails, recreate the venv: `rm -rf .venv && source activate.sh`.

## `uvicorn is required`

```bash
source activate.sh
```

(`activate.sh` installs `uvicorn[standard]`; only run `pip install "uvicorn[standard]"` manually if you skipped activate.)

## `pip install -e .`: `Invalid version: 'v0.2.1-brightN'`

BrightVision git tags use a `*-brightN` suffix (e.g. `v0.2.1-bright5`). setuptools-scm expects PEP 440, so a bare install can fail with `Invalid version: 'v0.2.1-bright5'`.

**Fix (default):** `pyproject.toml` maps tags via `scripts/git_describe_pep440.sh` (`v0.2.1-bright5` → `0.2.1.post5`). From repo root:

```bash
source activate.sh
pip install -e .
```

**Fallback** if describe still fails (shallow clone, missing tags): `SETUPTOOLS_SCM_PRETEND_VERSION=0.2.1.post5 pip install -e .` (match `-brightN` → `.postN` in `package.json` / `src-tauri/Cargo.toml`).

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
