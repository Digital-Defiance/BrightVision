# Aider Vision Roadmap

Living backlog for chat UX, engine behavior, spec-driven work, and charter-level evolution ([AGENTS.md](../AGENTS.md) § Evolution).

**Public summary:** [README.md](../README.md#-roadmap-status) · [docs site](https://aider-vision.digitaldefiance.org/#roadmap) (`docs/index.html`). Update those summaries when statuses change here.

**Agents:** Read this file before substantive work; follow **Suggested fix order** until open items are **Done**; update statuses in the same session when you ship or learn something new. Instructions: `AGENTS.md` (Product roadmap) and `.cursor/rules/roadmap.mdc`.

## Current focus — cecli engine migration (Priority)

**Blocking work:** port Vision HTTP/session layer onto **cecli** in `bright-vision-core`, then swap submodule. Do not start routine UX backlog until [CECLI_MIGRATION_ROADMAP.md](./CECLI_MIGRATION_ROADMAP.md) Gate A4 passes (or user reprioritizes).

| Doc | Use when |
|-----|----------|
| [CECLI_MIGRATION_ROADMAP.md](./CECLI_MIGRATION_ROADMAP.md) | **Agent execution plan** — phases, gates, sessions, checklist |
| [CORE_FILE_MERGE.md](./CORE_FILE_MERGE.md) | Per-file PORT_NEW / MERGE_HUNKS / KEEP_CECLI |
| [BRIGHT_VISION_PIVOT.md](./BRIGHT_VISION_PIVOT.md) | Rebrand, website, PyPI/Homebrew (after engine swap) |

---

## Dogfooding (after engine swap)

Primary validation mode: **use the desktop app on real repos** (especially hacking on Aider Vision itself), not more automation or CI.

| Doc | Use when |
|-----|----------|
| [USER_WORKFLOW.md](./USER_WORKFLOW.md) | Workspace = **superproject root** (`aider-vision/`), not `aider-vision-core/` alone |
| [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md) | Editing files under `aider-vision-core/` + parent tree in one session |
| [TESTING.md](./TESTING.md) | Before/after sessions: `yarn test:local` (quick), `yarn test:full` before larger changes |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Stuck Connecting, orphaned `:8741`, Stop vs Start |

Log dogfooding bugs as roadmap rows or issues with repro (workspace path, file path, expected vs actual commit repo).

## Status legend

| Status | Meaning |
|--------|---------|
| Done | Shipped in repo (parent UI and/or `aider-vision-core` submodule) |
| Open | Not started or in progress |
| Partial | Some behavior exists; gaps documented |
| Longer-term | Strategic; design before build |
| **Priority** | Do before routine UX backlog unless user says otherwise |

---

## Priority — workspace & submodules

| # | Status | Item |
|---|--------|------|
| **19** | **Partial** | **Automated:** `yarn verify:submodule`, `test_git_workspace.py`, `test_superproject_integration.py` (RepoSet, `/add` paths, Session). **Dogfooding sign-off:** manual A–D in [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md) via `yarn tauri dev` — not yet a roadmap **Done**. |
| **31** | **Open** | **Release hygiene** — commit/tag `aider-vision-core`, bump submodule pointer ([RELEASE.md](./RELEASE.md)). Defer until dogfooding is stable; operator/git, not blocking daily use. |

---

## Chat & output UX

| # | Status | Item |
|---|--------|------|
| 1 | **Done** | Stream dedupe — core skips stdout when `yield_stream`; UI `appendStreamingToken` for cumulative chunks; timeline interleaves tools (`stream-chat.spec.ts`) |
| 2 | **Done** | Proposed edits in fenced blocks → collapsed accordions; **Applied** vs **Proposed only** from `done.edited_files` |
| 8 | **Done** | Duplicate assistant text (same stdout fix as #1) |
| 9 | **Done** | Basic section chips for `► **THINKING**` / `► **ANSWER**` (`splitAssistantSections`) |
| 10 | **Done** | Dismiss (×) on chat bubbles |
| 11 | **Done** | Chat / tool / terminal list caps (`MAX_*` in `chatStream.ts`) |
| 13 | **Done** | Token stats footer (`TokenStatsBar`, parses `Tokens:` tool_output) |
| 15 | **Done** | Suppress empty `tool_output` in `App.tsx` + `ChatPanel` |
| 6 | **Done** | Full-width chat (`ChatPanel` drops `maxWidth="md"`) |
| **25** | **Done** | Richer assistant section parser — multiple markers per message (`**THINKING**` / `**ANSWER**` / `**REASONING**`) |

## Input & session control

| # | Status | Item |
|---|--------|------|
| 5 | **Done** | Multiline input: Shift+Return newline, Enter to send |
| 3 | **Done** | Stop in-flight turn (`cancelSend` + AbortSignal on fetch) |
| 4 | **Done** | Queue messages while busy (`useAiderSession` queue + Queue button in `ChatPanel`) |
| 12 | **Done** | `/add` / `/drop` path completion via Tauri `complete_workspace_path` + Tab in chat |
| **32** | **Partial** | **Suggested files tray** — parse assistant **Answer** for repo-relative paths; tray above chat input with **Add all**, **Queue `/add`**, dismiss; uses `addFiles` + message queue (#4). **Open:** e2e polish, tree picker tie-in (#28). See [§ #32 design](#32-suggested-files--queued-add) |

## Approvals, workspace & engine

| # | Status | Item |
|---|--------|------|
| 7 | **Done** | Confirm flow: `yes=False` default, `POST /sessions/{id}/confirm`, UI Yes/No + auto-approve countdown |
| 14 | **Done** | No longer pass workspace dir as chat file (`Session.create` empty `fnames`) |
| 17 | **Done** | Settings: prompt before commit → `auto_commits: false` on session create |
| — | **Done** | Terminate `:8741` core API on app quit (Tauri) |
| — | **Done** | **Core API lifecycle** — Start/Stop tied to activity-bar phases (`sessionLifecycle`), cancel in-flight start, `start_core_api` timeout, health fetch timeouts, port cleanup on stop/launch, SSE reader release ([TROUBLESHOOTING.md](./TROUBLESHOOTING.md)) |

## Multi-modal & platform

| # | Status | Item |
|---|--------|------|
| 16 | **Done** | Attach images/PDF via chat (Tauri picker + browser upload → `/sessions/{id}/files`) |
| **33** | **Partial** | **Resource overlay** — bottom-left CPU/RAM/GPU HUD (system-wide; GPU via `nvidia-smi` when present); Settings toggles. Tauri desktop only. See [§ #33](#33-resource-overlay-cpugpu) |
| **34** | **Partial** | **Thinking timers** — live elapsed on current section; durations on completed Thinking/Reasoning/Answer chips; per-model averages vs prompt length in Settings (`localStorage`). See [§ #34 design](#34-thinking-timers) |
| **35** | **Partial** | **Context window awareness** — header chip: file count + last `Tokens:` sent / ~added estimate; sync `files_in_chat` after `done` + `/add`; desktop byte estimate on `addFiles`. See [§ #35](#35-context-window--file-counter) |
| **36** | **Partial** | **LLM ping** — Terminal/Settings **Ping LLM**: Ollama tags + 1-token generate + optional core `/health`; no repo edits. See [§ #36](#36-llm-ping) |

## Spec-driven development (#18)

**Goal:** Kiro-*inspired* spec-driven work without cloning Kiro’s IDE. Shipped v1–v5; gaps vs Kiro tracked as **#20–22** below.

| Phase | Status | Scope |
|-------|--------|--------|
| v1 | **Done** | Tasks tab, `.aider-vision/todos.json`, active task chip, spec inject, `/todo` in core |
| v2 | **Done** | Session todos HTTP API, `active_todo_id` / `inject_todo_spec`, templates, checklist |
| v3 | **Done** | Workspace todos HTTP, checklist auto-complete, markdown import/export |
| v4a | **Done** | Three-layer specs, `depends_on`, `spec-driven` template, `.aider-vision/specs/{id}/` sync |
| v4b | **Done** | AI generate/refine spec, steered **Implement** per implementation task |
| v5 | **Done** | Background `generate-spec` jobs; ephemeral session; job poll |

| # | Status | Item |
|---|--------|------|
| 18a–18e | **Done** | Core/UI todos API, generate/refine, steered steps, reload spec from disk |

### Kiro / spec parity (from [SPEC_DRIVEN_DEV.md](./SPEC_DRIVEN_DEV.md))

| # | Status | Item |
|---|--------|------|
| **20** | **Open** | Dedicated spec-agent UX — separate surface/thread for spec work (not only ephemeral jobs + Tasks tab) |
| **21** | **Open** | EARS / requirements linter — validate WHEN/SHALL structure; beyond LLM “Refine spec” |
| **22** | **Open** | Repo-wide spec index — discover and sync all `.aider-vision/specs/**`; “Sync Files” style maintenance |

---

## Charter evolution ([AGENTS.md](../AGENTS.md) § Evolution Roadmap)

Maps the high-level product charter to tracked work. Items **23–24** are largely satisfied by the tactical rows above; **25–29** carry the remaining charter intent.

| # | Status | Charter theme | Tactical mapping / gap |
|---|--------|---------------|-------------------------|
| **23** | **Done** | Process & terminal integration | Vision HTTP/SSE, `useAiderSession`, stop/queue, Tauri core spawn, terminal stream, reliable start/stop lifecycle |
| **24** | **Done** | LLM chat interface | Chat panel, markdown, proposed edits, confirms, token stats |
| **25** | **Done** | (overlap) Richer chat sections | Same as chat **#25** |
| **26** | **Partial** | File system watcher | Git status polls on **Git** tab + while session runs (8s); native FS notify still open |
| **27** | **Done** | Git visualization (charter §3) | Working tree, inline diffs, commit graph + details, stage all/file, auto-stage on `done`, undo + refresh. **Nice-to-have:** syntax-highlighted diffs |
| **28** | **Partial** | Context awareness (charter §5) | **Done:** images/PDF, `/add` paths, terminal tail, Tauri folder picker, **web folder path** dialog → `addFiles`, **suggested-files tray (#32)**. **Open:** file-tree picker, modified-file highlights (**#26**) |
| **29** | **Longer-term** | Plugin / extension system | Custom Rust commands, third-party LLM providers, packaged extensions |
| **30** | **Partial** | Web / non-Tauri parity | **Done:** folder path attach, localStorage todos, Vite `/api/core` proxy; `/add` Tab on **desktop** (#12). **Open:** `/add` Tab on web-only dev; full generate-spec UX without desktop (dogfood Tasks tab on desktop first). |

---

## #32 — Suggested files & queued `/add`

**Problem:** The model often ends with a bullet list of paths (“Please add these files…”) but the user must copy each path into chat as `/add …` one by one.

**Goal:** First-class context UX aligned with dogfooding and spec work (#18–22).

### Behavior (target)

1. **Detect** — After an assistant turn, parse the **Answer** section (► **ANSWER**, `**ANSWER**`, or `Answer` heading) for workspace-relative paths: backtick paths in bullet lists, e.g. `` `src/todos/types.ts` ``.
2. **Accumulate** — Merge into a session-scoped **Suggested** list (dedupe, drop paths already in `files_in_chat`).
3. **Tray UI** — Chips or list near chat input: path, remove, “Add”, “Add all”, “Queue `/add`s”.
4. **Queue `/add`s** — Enqueue one user message per file (`/add aider-vision-core/.../session.py`, …) via existing `useAiderSession` queue (#4) so core handles each add like typed input.
5. **Add all (fast path)** — Optional single `addFiles(paths)` API call when batch attach is enough (no per-file `/add` narration).

### Parser spike (in repo)

`src/utils/suggestedFiles.ts` + tests — extracts the Kiro/spec example list into seven paths and builds:

```text
/add aider-vision-core/aider_vision_core/todo_spec_generate.py
/add aider-vision-core/aider_vision_core/workspace_todos.py
… (one queued message per path)
```

**Shipped (Partial):** `SuggestedFilesTray` in `ChatPanel`, session state in `App.tsx` (ingest on `done`, prune when `files_in_chat` updates). Remaining: structured SSE from core, optional auto-queue.

### Out of scope (v1)

- Core emitting structured `suggested_files` SSE (parser-first in UI).
- Auto-queue without confirmation.
- `/drop` suggestions.

---

## #33 — Resource overlay (CPU/GPU %)

**Problem:** Long local-LLM / core sessions spike CPU/GPU; users want at-a-glance load without leaving Vision or opening Activity Monitor / `nvidia-smi`.

**Goal:** Small, non-intrusive HUD — default **bottom-left** of the main content area (above snackbars, not covering the left nav rail). Configurable in **Settings → Appearance** (or **System**): enable overlay, refresh interval (e.g. 1–5 s), metric set, optional warn tint above threshold.

### Multi-platform feasibility

| Metric | macOS | Linux | Windows | Notes |
|--------|-------|-------|---------|--------|
| **CPU %** (system or process) | Yes | Yes | Yes | Rust [`sysinfo`](https://crates.io/crates/sysinfo) in Tauri; poll on background task, `invoke('get_resource_snapshot')` |
| **RAM** (used / %) | Yes | Yes | Yes | Same crate; cheap and reliable |
| **GPU %** (utilization) | Partial | Partial | Partial | **Not one portable API.** v1 may omit GPU or show “—” with tooltip “GPU stats unavailable on this OS” |
| **Web / `yarn dev` only** | N/A | N/A | N/A | Hide overlay or show disabled chip — aligns with **#30** (no fake numbers from browser) |

**GPU v2 options (pick per OS in Rust, behind feature flags):**

- **macOS:** IOKit / `powermetrics`-style sampling, or vendor tools if installed; Apple Silicon often reports GPU via `ioreg` / Metal counters — needs spike per target OS version.
- **Linux:** Parse `nvidia-smi` / `rocm-smi` when present; AMD/Intel via sysfs where exposed; fallback none.
- **Windows:** DXGI / Performance Counters / `nvidia-smi` — separate code path.

**Process-scoped mode (recommended v1):** Aggregate CPU/RAM for PIDs Vision already knows — `aider` / core Python, optional **Ollama** when `manageLocalLlm` + local model — so the overlay answers “is *my session* melting the machine?” without claiming full-system GPU on every laptop.

### Suggested implementation sketch

1. **Rust:** `resource_monitor.rs` — `sysinfo` refresh every N ms; optional child-PID list from session spawn handles; serde snapshot `{ cpu_pct, mem_used_mb, mem_pct, gpu_pct?: number | null, label }`.
2. **Tauri command** + event emit optional (`resource-snapshot` every poll) to avoid polling from JS.
3. **React:** `ResourceOverlay.tsx` — `position: fixed; left: …; bottom: …; pointer-events: none` (or `auto` for expand-on-hover); respect `AppearanceConfig` + `prefers-reduced-motion` (pause animation, still allow static %).
4. **Settings:** toggles persisted in `localStorage` / config JSON like appearance fonts.
5. **e2e:** mock `get_resource_snapshot` fixed values; assert overlay visible when enabled.

### Difficulty (honest)

| Scope | Rating |
|-------|--------|
| CPU + RAM overlay, system-wide, macOS + Linux | **~4/10** |
| + process-scoped (core + ollama children) | **~5/10** |
| + GPU % with graceful fallback on all three OSes | **~7/10** |
| Always-on-top / screen-wide overlay (true HUD outside window) | **Out of scope** — separate window / OS APIs; not bottom-left *in-app* |

### Out of scope (v1)

- Historical graphs / logging to disk.
- Per-GPU die temperature fan curves.
- Replacing macOS Menu Bar widgets or Linux `conky`.

**Shipped (Partial):** `get_resource_snapshot` (sysinfo) + `ResourceOverlay` fixed bottom-left; Settings → Resource overlay (interval, GPU line, CPU warn threshold).

**Open:** Process-scoped CPU (core + Ollama PIDs); Apple/AMD GPU without `nvidia-smi`; history sparkline.

---

## #34 — Thinking timers

**Problem:** Long “Thinking” stretches feel opaque; no way to compare model latency across prompts.

**Shipped (Partial):**

1. **Live bar** above chat input (`ThinkingTimerBar`) while the agent is busy — current section label + active elapsed + turn elapsed.
2. **Completed messages** — chip labels like `Thinking · 4.2s`; caption `Turn 12.1s · thought 8.0s` when markers present.
3. **Settings → Thinking timers** — toggles for live timer, section durations, turn total, model stats panel.
4. **Persistence** — `aider-vision-thinking-stats` in `localStorage`: rolling samples per `config.model`, avg thought ms and ~ms per 1k prompt chars.

**Detection:** Section boundaries from streamed `► **THINKING**` / `**REASONING**` / `**ANSWER**` markers (`getActiveAssistantSection`); timer runs for the whole turn until `done` (survives tool_output gaps that split assistant bubbles).

**Open / v2:**

- Burndown chart or trend line in Settings / Tasks.
- Export stats JSON; sync across machines.
- Core SSE fields (`section_started`, `thought_ms`) instead of parser-only.
- Include queued-wait time separately from model “thought” time.

---

## #35 — Context window & file counter

**Problem:** Top-right file count stayed on `sessionInfo` from session start; `/add` via chat never refreshed. No visibility into context growth from added files.

**Shipped (Partial):**

1. **Unified `filesInChat`** — header chip uses `filesInChat` synced with `patchSessionFiles` on every `addFiles` / upload / `GET session` after `done`.
2. **Header chip** — `N files · 12.0k sent` or `N files · ~2.1k added` (`data-testid="session-context-chip"`).
3. **`/add` via chat** — after each `done`, `refreshSessionInfo()` pulls current `files_in_chat` from core.
4. **Add estimate (desktop)** — Tauri `estimate_paths_context_chars` → cumulative `~tokens` in snackbar + tooltip; web relies on `Tokens:` line after turns.

**Open:** Core-reported context % / repo-map size; per-file breakdown; model context limit bar.

---

## #36 — LLM ping

**Problem:** Hard to tell Ollama load vs hung vs core down without starting a full chat turn.

**Shipped (Partial):** **Ping LLM** on Local LLM panel (Terminal + Settings): `GET /api/tags`, `/api/ps`, `POST /api/generate` with `num_predict: 1` (no workspace files), optional `GET {coreApiUrl}/health`. Logs to Terminal; result alert with latency.

**Open:** Ping from header when session stuck; cloud provider ping (non-Ollama); session-level dry-run ping in core.

---

## Known context

- **Local testing (no CI required):** `yarn test:fast` / `yarn test:local` / `yarn test:full`; see [TESTING.md](./TESTING.md). Playwright mocks `/api/core` + Tauri `invoke` — does **not** replace `yarn tauri dev` dogfooding ([e2e/ROADMAP_COVERAGE.md](../e2e/ROADMAP_COVERAGE.md)).
- **#19:** Core/submodule wiring is automated-green; treat **SUBMODULE_VERIFICATION.md** sections A–D as the dogfooding gate for “hack on Vision itself.”
- **#31:** Release tagging when you want reproducible pins for others — not required for solo dogfood on `main`.
- **Stuck “Connecting”:** Terminal **Stop** while activity bar shows boot/connect; quit app to clear orphaned `:8741` ([TROUBLESHOOTING.md](./TROUBLESHOOTING.md)). Covered in mocked e2e only.
- **`POST /sessions/{id}/confirm`**: body `{ "confirm_id", "answer": true|false }`.
- **Message queue**: drain on turn end; Stop does not clear queue.
- **`/add` completion**: Tauri desktop only (#12); type path manually on web-only `yarn dev`.
- **Tasks:** `.aider-vision/todos.json`; workspace API when session + core up; Tauri file mirror when core is down.
- **18d:** Task list uses **manual order** (Up/Down); `depends_on` shows **blocked** chip, not auto-sort.
- **Dogfooding friction to watch:** wrong workspace (submodule-only root), proposed vs applied edits, commit in wrong repo, Tasks generate-spec + Implement on real core.

## Suggested fix order

**While dogfooding** (fix only what blocks daily use; file small roadmap/doc updates when you learn something):

1. **#19 dogfooding** — [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md) A–D on `yarn tauri dev` (superproject root); Tasks generate-spec + one **Implement** step on a real task.
2. **Friction from dogfood** — promote to **Open** rows or fix immediately (lifecycle, git tab, context attach, tasks sync).
3. **#28 / #32** (if context picking hurts) — **#32** suggested-files tray + queued `/add`; file-tree / modified-file highlights over **#26** watcher unless git poll is insufficient.
4. **#31** — [RELEASE.md](./RELEASE.md) when sharing builds or pinning submodule for collaborators.
5. **#20–22** — Kiro-depth spec product (after dogfood stabilizes core loop).
6. **#29, #30** — Plugins, remaining web parity (longer horizon).
7. **#33** — Resource overlay when local LLM / long runs make CPU/GPU visibility painful (CPU/RAM first; GPU best-effort).

## Related docs

- [DEVELOPMENT.md](./DEVELOPMENT.md) — local setup  
- [IPC.md](./IPC.md) — Vision HTTP / SSE events, todos API  
- [SPEC_DRIVEN_DEV.md](./SPEC_DRIVEN_DEV.md) — spec-driven tasks (shipped vs Kiro)  
- [RELEASE.md](./RELEASE.md) — commit/tag checklist  
- [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md) — superproject + submodule  
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — common failures  
- [BUILD_MACOS.md](./BUILD_MACOS.md) — DMG / signing  
- [TESTING.md](./TESTING.md) — local-first: Vitest, Rust, Playwright e2e ([roadmap matrix](../e2e/ROADMAP_COVERAGE.md))  
