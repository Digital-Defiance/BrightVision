# Aider Vision architecture

## Head and body

| Layer | Role | Location |
|-------|------|----------|
| **Head** | UI, prompts, user intent, all product logic | `src/` (React + Tauri shell) |
| **Body** | Headless engine: Session, git, LLM, repo-map | `aider-vision-core/` (translocated; no user-facing CLI) |

Aider Vision **beheads** the old standalone aider UX. Users never type into `aider-vision-core` interactively. Every turn is:

```text
React → Vision API (HTTP + SSE, or Tauri-managed local serve) → Session.run_message → events → React
```

## API surface (canonical)

Same contract everywhere:

- `GET /health`
- `POST /sessions` — workspace, model, optional files
- `POST /sessions/{id}/messages` — SSE stream of event dicts
- `POST /sessions/{id}/undo`
- `DELETE /sessions/{id}`

Desktop: Tauri spawns `scripts/vision_serve.py` from the embedded engine tree and returns `http://127.0.0.1:<port>`. React uses the same `CoreHttpClient` as the web IDE.

## Multi-repo

Workspace path = git **superproject** root. Nested submodules are handled inside core (`RepoSet`); React only passes the workspace string.

## What we do not do

- No interactive CLI in the product UI
- No bypassing React to “drive aider directly”
- No duplicate event schemas (legacy `{type,payload}` is retired)

See `docs/IPC.md` for event shapes.
