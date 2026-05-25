# Aider Vision Roadmap

Living backlog for chat UX, engine behavior, spec-driven work, and charter-level evolution ([AGENTS.md](../AGENTS.md) § Evolution).

**Agents:** Read this file before substantive work; follow **Suggested fix order** until open items are **Done**; update statuses in the same session when you ship or learn something new. Instructions: `AGENTS.md` (Product roadmap) and `.cursor/rules/roadmap.mdc`.

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
| **19** | **Done** | Submodule / multi-repo verified: `yarn verify:submodule` + `test_superproject_integration.py` (RepoSet, `/add` paths, Session). Manual UI pass still useful for SEARCH/REPLACE + commit. See [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md). |
| **31** | **Open** | **Release hygiene** — commit/tag `aider-vision-core`, bump submodule pointer, verify ([RELEASE.md](./RELEASE.md)). Code is landed locally; not yet tagged in git. **Operator task** (not blocked on code). |

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
| **30** | **Partial** | Web / non-Tauri parity | **Done:** folder path attach, localStorage todos, Vite `/api/core` proxy. **Open:** path Tab complete, full generate-spec UX without desktop |

---

## Known context

- **#19 / #31:** Submodule verification passes; release still needs git tag + pointer bump (see [RELEASE.md](./RELEASE.md)).
- **Stuck “Connecting”:** Use Terminal **Stop** (enabled while activity bar shows boot/connect); quit app to clear orphaned `:8741` listeners. Covered by `e2e/session-lifecycle.spec.ts`.
- **E2E:** Most **Done** roadmap rows have Playwright coverage on web preview (mock `/api/core` + mock Tauri `invoke` for desktop paths); see [e2e/ROADMAP_COVERAGE.md](../e2e/ROADMAP_COVERAGE.md). Real `yarn tauri dev` smoke remains manual.
- **`POST /sessions/{id}/confirm`**: body `{ "confirm_id", "answer": true|false }`.
- **Message queue**: drain on turn end; Stop does not clear queue.
- **`/add` completion**: desktop Tauri only.
- **Tasks:** `.aider-vision/todos.json`; desktop mirrors via Tauri when core is down.
- **18d:** Task list uses **manual order** (Up/Down); `depends_on` shows **blocked** chip, not auto-sort.

## Suggested fix order

1. **#31** — [RELEASE.md](./RELEASE.md): commit/tag core, bump submodule, `yarn verify:submodule` (operator / git)
2. **#19** — Manual UI pass (submodule edit + Tasks generate/implement)
3. **#26** — Native file watcher (or deeper modified-file highlights in Git/Tasks)
4. **#28** — File-tree context picker (web + desktop)
5. **#20–22** — Kiro-depth spec features (when prioritizing spec product)
6. **#29, #30** — Plugins, remaining web parity (longer horizon)

## Related docs

- [DEVELOPMENT.md](./DEVELOPMENT.md) — local setup  
- [IPC.md](./IPC.md) — Vision HTTP / SSE events, todos API  
- [SPEC_DRIVEN_DEV.md](./SPEC_DRIVEN_DEV.md) — spec-driven tasks (shipped vs Kiro)  
- [RELEASE.md](./RELEASE.md) — commit/tag checklist  
- [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md) — superproject + submodule  
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — common failures  
- [BUILD_MACOS.md](./BUILD_MACOS.md) — DMG / signing  
- [TESTING.md](./TESTING.md) — Vitest, Rust git tests, Playwright e2e ([roadmap matrix](../e2e/ROADMAP_COVERAGE.md))  
