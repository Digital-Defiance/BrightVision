# BrightVision IPC

React is the **head**. All prompting goes through the **Vision HTTP API** (same contract in desktop and browser). Cecli runs headless behind `bright_vision_core` — no interactive CLI in the product.

See `docs/ARCHITECTURE.md`.

## Vision HTTP API (canonical)

For browser-only clients, run the Vision API server:

```bash
bright-vision-core-serve --host 127.0.0.1 --port 8741
```

(Installed via `source activate.sh` or `pip install -e .` in this repo.)

Implementation: `bright_vision_core/http_api.py` — create session, `POST /sessions/{id}/messages` returns Server-Sent Events with event dicts consumed by `src/ipc/events.ts`.

Answer blocking confirms while a message is in flight:

```http
POST /sessions/{session_id}/confirm
{"confirm_id": "<from confirm event>", "answer": true}
```

Session create accepts `auto_yes` (default `false`) and `auto_commits` (default `true`).

Add images or PDFs to the chat without sending a message:

```http
POST /sessions/{session_id}/files
{"paths": [".cecli/attachments/screenshot.png"]}
```

Browser upload (base64 data URLs accepted):

```http
POST /sessions/{session_id}/files/upload
{"files": [{"filename": "shot.png", "content_base64": "data:image/png;base64,..."}]}
```

Response includes updated `files_in_chat` and `events` (tool_output / errors).

> **Note:** Project-local state lives under **`.cecli/`**: Cecli uses `agents/`, `sessions/`, `logs/`, …; BrightVision adds `todos.json`, `specs/`, `attachments/`.

### Workspace tasks (spec-driven)

Todos live in `.cecli/todos.json` under the session workspace.

```http
GET    /sessions/{session_id}/todos
POST   /sessions/{session_id}/todos          {"title", "spec?", "template?"}
PATCH  /sessions/{session_id}/todos/{id}     partial update: title, spec, requirements, design, tasks_md, depends_on, branch, pr_url, checklist, status, links
POST   /sessions/{session_id}/todos/{id}/generate-spec   {"prompt", "mode", "apply", "background": true} → 202 {job_id} or 200 when complete
GET    /workspaces/todos/generate-spec/{job_id}   poll job status
DELETE /sessions/{session_id}/todos/{id}
PUT    /sessions/{session_id}/todos/active   {"activeId": "…" | null}
```

Send a message with task context:

```http
POST /sessions/{session_id}/messages
{
  "content": "Implement the login flow",
  "active_todo_id": "<task-uuid>",
  "inject_todo_spec": true
}
```

The `done` event may include `active_todo_id`; edited files and commits are appended to that task’s `links`.

### Session debug export

When a turn misbehaves (wrong tool arguments, duplicate `GitLog`/`Grep`, char-split todos), export a JSON bundle:

```http
GET /sessions/{session_id}/debug
```

Includes: session metadata, cecli message history with `tool_calls`, parsed tool invocations, duplicate-call hints, agent `todo.txt` snapshot, and the last ~800 `EventIO` events. Desktop: **Terminal → Export debug**. Redact secrets before sharing.

### Workspace tasks (no session)

Same todo file; use when the Vision API is running but you have not opened a chat session:

```http
GET    /workspaces/todos?workspace=/abs/path/to/repo
POST   /workspaces/todos?workspace=…
PATCH  /workspaces/todos/{id}?workspace=…   → { item, auto_completed }
DELETE /workspaces/todos/{id}?workspace=…
PUT    /workspaces/todos/active?workspace=…
GET    /workspaces/todos/export?workspace=…
POST   /workspaces/todos/import   {"workspace", "markdown", "merge": false}
POST   /workspaces/todos/{id}/generate-spec?workspace=…&session_id=…   same body as session route
POST   /workspaces/todos/{id}/move?workspace=…   {"direction": "up"|"down"}
POST   /workspaces/todos/{id}/sync-spec-files?workspace=…   import specs from `.cecli/specs/{id}/`
```

`auto_completed` is true when a PATCH checklist update completes every item (task marked done).

Optional auth: set `BRIGHT_VISION_TOKEN` (or `BRIGHT_VISION_TOKEN` where supported) and send `Authorization: Bearer <token>`.

## Multi-repo workspaces (including nested submodules)

Point `workspace` at the **git superproject root** (e.g. this repo, which may contain nested submodules).

Core uses `create_git_workspace()` / `RepoSet` in `bright_vision_core`:

- Discovers submodule roots via `git submodule status --recursive` **and** a recursive `.gitmodules` walk.
- Opens a `GitRepo` per nested checkout (e.g. `vendor/lib`, `vendor/lib/pkg`).
- Excludes submodule **gitlink** paths (mode `160000`) from repo-map file lists — only real files are indexed.
- Commits run innermost repos first, then update parent gitlinks.

For self-dev on BrightVision: set working directory to the parent repo root.

## Web dev proxy

Vite proxies `/api/core` → `http://127.0.0.1:8741`. In browser mode, set **Vision API URL** to `/api/core` (relative) or the full serve URL.

## Desktop

Tauri spawns `scripts/vision_serve.py` (wrapper around `bright-vision-core-serve`). React uses `CoreHttpClient` against `http://127.0.0.1:8741` (URL from `start_core_api`).

TypeScript client: `src/ipc/httpClient.ts`, session factory in `src/ipc/commands.ts` / hooks.

## SSE event shapes

Each `data:` line in the message stream is a JSON object (must stay aligned with `src/ipc/events.ts`):

```json
{"type": "user_message", "text": "..."}
{"type": "token", "text": "partial"}
{"type": "progress", "label": "Scanning repo", "current": 40, "total": 100, "fraction": 0.4, "message": "40/100"}
{"type": "tool_output", "text": "..."}
{"type": "confirm", "confirm_id": "…", "question": "…", "auto_answered": false}
{"type": "done", "assistant_text": "...", "edited_files": ["src/foo.ts"], "commit_hash": "abc123"}
{"type": "error", "text": "..."}
```

Python sources: `bright_vision_core/event_io.py`, `session.py`.
