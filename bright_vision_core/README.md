# bright_vision_core

HTTP/SSE integration layer for **BrightVision** on top of **[Cecli](https://cecli.dev)** — built in partnership with the Cecli team ([dwash96/cecli](https://github.com/dwash96/cecli)).

- `http_api.py` — FastAPI + SSE (`:8741`)
- `session.py` — headless async sessions
- `git_workspace.py` — superproject + submodule `RepoSet`
- `workspace_todos.py` — EARS/spec tasks (`.cecli/todos.json`)

Install: `pip install bright-vision-core` (includes `cecli`).  
Run: `bright-vision-core-serve` or `python scripts/vision_serve.py` → `http://127.0.0.1:8741`.
