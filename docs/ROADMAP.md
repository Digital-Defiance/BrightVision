# Aider Vision Roadmap

Living backlog for chat UX, engine behavior, spec-driven work, and charter-level evolution ([AGENTS.md](../AGENTS.md) § Evolution).

**Agents:** Read this file before substantive work; follow **Suggested fix order** until open items are **Done**; update statuses in the same session when you ship or learn something new. Instructions: `AGENTS.md` (Product roadmap) and `.cursor/rules/roadmap.mdc`.

## Current focus — dogfooding

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
| 1 | **Done** | Fix stream doubling — headless mode skips `stdout` writes when `yield_stream` (`base_coder.py`) |
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
| **28** | **Partial** | Context awareness (charter §5) | **Done:** images/PDF, `/add` paths, terminal tail, Tauri folder picker, **web folder path** dialog → `addFiles`. **Open:** file-tree picker, modified-file highlights (**#26**) |
| **29** | **Longer-term** | Plugin / extension system | Custom Rust commands, third-party LLM providers, packaged extensions |
| **30** | **Partial** | Web / non-Tauri parity | **Done:** folder path attach, localStorage todos, Vite `/api/core` proxy; `/add` Tab on **desktop** (#12). **Open:** `/add` Tab on web-only dev; full generate-spec UX without desktop (dogfood Tasks tab on desktop first). |

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
3. **#28** (if context picking hurts) — file-tree / modified-file highlights over **#26** watcher unless git poll is insufficient.
4. **#31** — [RELEASE.md](./RELEASE.md) when sharing builds or pinning submodule for collaborators.
5. **#20–22** — Kiro-depth spec product (after dogfood stabilizes core loop).
6. **#29, #30** — Plugins, remaining web parity (longer horizon).

## Related docs

- [DEVELOPMENT.md](./DEVELOPMENT.md) — local setup  
- [IPC.md](./IPC.md) — Vision HTTP / SSE events, todos API  
- [SPEC_DRIVEN_DEV.md](./SPEC_DRIVEN_DEV.md) — spec-driven tasks (shipped vs Kiro)  
- [RELEASE.md](./RELEASE.md) — commit/tag checklist  
- [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md) — superproject + submodule  
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — common failures  
- [BUILD_MACOS.md](./BUILD_MACOS.md) — DMG / signing  
- [TESTING.md](./TESTING.md) — local-first: Vitest, Rust, Playwright e2e ([roadmap matrix](../e2e/ROADMAP_COVERAGE.md))  
