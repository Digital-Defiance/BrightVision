# Aider Vision IPC

React is the **head**. All prompting goes through the **Vision HTTP API** (same contract in desktop and browser). The engine in `aider-vision-core/` is headless — no interactive CLI in the product.

See `docs/ARCHITECTURE.md`.

## Vision HTTP API (canonical)

For browser-only clients, run the core API server:

```bash
aider-vision-core-serve --host 127.0.0.1 --port 8741
```

See `aider-vision-core/aider_vision_core/http_api.py` — create session, `POST /sessions/{id}/messages` returns Server-Sent Events with the same event dicts.

Answer blocking confirms while a message is in flight:

```http
POST /sessions/{session_id}/confirm
{"confirm_id": "<from confirm event>", "answer": true}
```

Session create accepts `auto_yes` (default `false`) and `auto_commits` (default `true`).

Add images or PDFs to the chat without sending a message:

```http
POST /sessions/{session_id}/files
{"paths": [".aider-vision/attachments/screenshot.png"]}
```

Browser upload (base64 data URLs accepted):

```http
POST /sessions/{session_id}/files/upload
{"files": [{"filename": "shot.png", "content_base64": "data:image/png;base64,..."}]}
```

Response includes updated `files_in_chat` and `events` (tool_output / errors).

Optional auth: set `AIDER_VISION_TOKEN` and send `Authorization: Bearer <token>`.

## Multi-repo workspaces (including nested submodules)

Point `workspace` at the **git superproject root** (e.g. this repo, which contains the `aider-vision-core` submodule).

Core uses `create_git_workspace()` / `RepoSet`:

- Discovers submodule roots via `git submodule status --recursive` **and** a recursive `.gitmodules` walk.
- Opens a `GitRepo` per nested checkout (e.g. `vendor/lib`, `vendor/lib/pkg`).
- Excludes submodule **gitlink** paths (mode `160000`) from repo-map file lists — only real files are indexed.
- Commits run innermost repos first, then update parent gitlinks.

For self-dev on aider-vision: set working directory to the parent repo, not `aider-vision-core/` alone.

## Web dev proxy

Vite proxies `/api/core` → `http://127.0.0.1:8741`. In browser mode, set **Core API URL** to `/api/core` (relative) or the full serve URL.

## Desktop

Tauri spawns `aider-vision-core/scripts/vision_serve.py` and React uses `CoreHttpClient` against `http://127.0.0.1:8741` (returned from `start_core_api`).

## SSE event shapes

Each `data:` line in the message stream is a JSON object:

```json
{"type": "user_message", "text": "..."}
{"type": "token", "text": "partial"}
{"type": "tool_output", "text": "..."}
{"type": "confirm", "confirm_id": "…", "question": "…", "auto_answered": false}
{"type": "done", "assistant_text": "...", "edited_files": ["src/foo.ts"], "commit_hash": "abc123"}
{"type": "error", "text": "..."}
```
