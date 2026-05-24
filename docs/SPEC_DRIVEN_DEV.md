# Spec-driven development & in-app TODOs (roadmap #18)

Design sketch — not implemented. Goal: lightweight **Kiro-like** flow inside Aider Vision without cloning IDE patterns.

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

## Suggested implementation order

1. File format + Tauri/React CRUD for `.aider-vision/todos.json`
2. Chat “active TODO” chip + inject spec into first message of a turn
3. Core command `/todo` mirror for headless parity
4. Link `done.edited_files` and git commits to TODO `links` in UI

## Open questions

- Should TODOs commit to git or stay local-only? **Default: local-only** (gitignored).
- One active TODO per session or global per workspace? **Per workspace**, one active in UI.
