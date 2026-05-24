# Aider Vision Roadmap

Living backlog for chat UX, engine behavior, and longer-term product direction.

**Agents:** Read this file before substantive work; follow **Suggested fix order** until open items are **Done**; update statuses in the same session when you ship or learn something new. Instructions: `AGENTS.md` (Product roadmap) and `.cursor/rules/roadmap.mdc`.

## Status legend

| Status | Meaning |
|--------|---------|
| Done | Shipped in repo |
| Open | Not started or in progress |
| Longer-term | Strategic; design before build |
| **Priority** | Do before routine UX backlog unless user says otherwise |

---

## Priority — workspace & submodules

| # | Status | Item |
|---|--------|------|
| **19** | **Done** | Submodule / multi-repo verified: `yarn verify:submodule` + `test_superproject_integration.py` (RepoSet, `/add` paths, Session). Manual UI pass still useful for SEARCH/REPLACE + commit. See [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md). |

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
| — | **Done** | Terminate `:8741` core API on app quit |

## Multi-modal & platform

| # | Status | Item |
|---|--------|------|
| 16 | **Done** | Attach images/PDF via chat (Tauri picker + browser upload → `/sessions/{id}/files`) |

## Longer-term product

| # | Status | Item |
|---|--------|------|
| 18 | Longer-term | In-app **TODO** system and **Kiro-like spec-driven development** — design: [SPEC_DRIVEN_DEV.md](./SPEC_DRIVEN_DEV.md) |

---

## Known context

- **#19:** Use `yarn verify:submodule` from repo root. `Session.create` must pass superproject as `git_dname` (already does). Untracked submodule files (e.g. new `brand.py`) may not appear in `path_in_repo` until committed — use tracked paths like `session.py` for `/add`.
- **`POST /sessions/{id}/confirm`**: body `{ "confirm_id", "answer": true|false }` — core blocks until answered when `auto_yes` is false.
- **Auto-approve countdown**: decrements on each auto-answered confirm, not on every send.
- **Section parser**: simple marker split; may need richer parsing for nested reasoning models.
- **Message queue**: queued sends drain automatically when the current turn finishes; Stop cancels the in-flight turn only (queue is kept).
- **`/add` completion**: desktop Tauri only; type `/add path/prefix` then Tab or pick from the path list.
- **Images**: use the image button in chat (staged under `.aider-vision/attachments/`). Model must support vision (`supports_vision` in model metadata).

## Suggested fix order

1. #18: implement per [SPEC_DRIVEN_DEV.md](./SPEC_DRIVEN_DEV.md) (design drafted)  

## Related docs

- [DEVELOPMENT.md](./DEVELOPMENT.md) — local setup  
- [IPC.md](./IPC.md) — Vision HTTP / SSE events  
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — common failures  
- [BUILD_MACOS.md](./BUILD_MACOS.md) — DMG / signing  
