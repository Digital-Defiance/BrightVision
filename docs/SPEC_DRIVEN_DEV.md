# Spec-driven development & in-app TODOs (roadmap #18)

**v1 shipped** in the desktop/web UI. This doc describes the model and future work.

Goal: lightweight **Kiro-like** flow inside Aider Vision without cloning IDE patterns.

## Problems to solve

1. Users lose track of multi-step agent work across chat turns.
2. Ad-hoc prompts lack a durable “definition of done.”
3. Submodule / multi-repo tasks need scoped checklists per repo.

## Proposed concepts

### Work item (TODO)

| Field | Purpose |
|-------|---------|
| `id` | Stable UUID |
| `title` | Short label |
| `spec` | Markdown: requirements, constraints, acceptance criteria |
| `status` | `open` \| `in_progress` \| `done` \| `cancelled` |
| `links` | Optional paths, issues, commits |
| `created_at` / `updated_at` | Audit |

Stored under **`.aider-vision/todos.json`** in the workspace (gitignored via `.aider*`).

### Spec session

- User picks a TODO → chat session gets **system context** injected once: spec + acceptance criteria.
- Agent turns reference the active TODO id in `done` metadata (future core field).
- Completing a TODO is manual or via `/todo done` command (core), not auto-inferred.

### UI (minimal v1)

- Side panel or drawer: list TODOs, editor for spec markdown.
- “Start work” sets active TODO and optionally pre-fills chat (“Implement TODO-3 per spec”).
- No Gantt charts, no VS Code task integration in v1.

### Core / API (future)

```
GET  /sessions/{id}/todos
POST /sessions/{id}/todos
PATCH /sessions/{id}/todos/{todo_id}
```

Optional: `POST /messages` field `active_todo_id` to attach turns.

## Non-goals (v1)

- Full formal verification, test generation pipelines, or external Kiro import.
- Cloud sync of TODOs (local workspace only).

## v1 (shipped)

1. `.aider-vision/todos.json` — Tauri `read_workspace_todos` / `write_workspace_todos`; browser uses `localStorage` keyed by workspace
2. **Tasks** nav tab — `TodoPanel` editor, Start work / Mark done / Set active
3. Chat — header chip for active task; spec prepended on first send after activation (`formatTodoContext`)
4. Turn links — `done.edited_files` and `commit:…` appended to active task `links`
5. Core — `/todo list|add|active|done` via `workspace_todos.py`

## v2 (shipped)

1. **HTTP API** — `GET/POST/PATCH/DELETE` todos and `PUT …/todos/active` on the session API ([IPC.md](./IPC.md))
2. **`active_todo_id` + `inject_todo_spec`** on `POST /messages`; `done.active_todo_id` and server-side link capture
3. **Templates** — `feature`, `bugfix`, `refactor` on create (UI + API)
4. **Checklist** — per-task items in JSON and in injected spec context

## Possible v3

- HTTP sync without requiring an active session (workspace-scoped routes)
- Auto-complete tasks from spec checklist when all items checked
- Import/export tasks markdown

## Open questions

- Should TODOs commit to git or stay local-only? **Default: local-only** (gitignored).
- One active TODO per session or global per workspace? **Per workspace**, one active in UI.
