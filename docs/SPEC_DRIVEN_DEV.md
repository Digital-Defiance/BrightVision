# Spec-driven development & in-app TODOs (roadmap #18)

Goal: lightweight **Kiro-like** flow inside BrightVision without cloning IDE patterns.

## Shipped (v1–v4a)

| Version | What |
|---------|------|
| v1 | Tasks tab, `.cecli/todos.json`, active task, spec inject, `/todo` command |
| v2 | Session todos HTTP API, `active_todo_id`, templates, checklist |
| v3 | Workspace todos HTTP, markdown import/export, checklist auto-complete |
| **v4a** | **Three-layer specs** (requirements / design / implementation tasks), `depends_on`, spec files under `.cecli/specs/{id}/`, `spec-driven` template |

### Three-layer model (v4a)

Each task can carry:

| Field | Role |
|-------|------|
| `requirements` | EARS-style requirements (WHEN / THE system SHALL) |
| `design` | Architecture and component design |
| `tasks_md` | Ordered implementation steps (markdown checklist, not the JSON checklist) |
| `checklist` | Runtime acceptance items (auto-complete task when all checked) |
| `depends_on` | Other task IDs that must be `done` before work is unblocked |

Legacy single `spec` is migrated into `requirements` on load when layers are empty.

**Injected chat context** includes all three layers plus checklist and blocker notes for incomplete dependencies.

**On disk:** updates sync to `.cecli/specs/<task-id>/requirements.md`, `design.md`, `tasks.md` (JSON remains source of truth in the app).

**Template:** choose `spec-driven` when creating a task for Kiro-style stubs.

## Task git links (shipped)

- `branch` and `pr_url` on each task (markdown `branch:` / `pr:` on export).
- Desktop: **Use current branch** fills from `git_workspace_status`.
- Included in injected spec context when starting work.

## v4b (shipped)

1. **Generate spec** / **Refine spec** — Tasks tab wizard (per-layer **Generate requirements** / **design** / **tasks** + optional **All layers**). Requires active session + Vision API.  
   `POST /sessions/{id}/todos/{todo_id}/generate-spec` or workspace route with `session_id` query.  
   Body: `{ "prompt", "mode": "generate"|"refine", "section": "requirements"|"design"|"tasks_md"|"all", "context_paths": [], "apply": true }`.
2. **Steered implementation** — parsed numbered lines in `tasks_md`; **Implement** per step prefills chat.
3. **Dependency order** — task list sorted topologically by `depends_on`.

## v5 (shipped)

- **Background jobs** — `POST …/generate-spec` with `background: true` returns `202` + `job_id`.
- **Ephemeral session** — `dry_run` headless session in a worker thread; chat session unchanged.
- **Poll** — `GET /workspaces/todos/generate-spec/{job_id}` until `completed` or `error`.

## v5b — Phased spec wizard (shipped)

Kiro-style **Requirements → Design → Tasks** with edit-between steps:

| Step | Prompt includes | Optional partial draft |
|------|-----------------|------------------------|
| `section=requirements` | User prompt | Existing `requirements` |
| `section=design` | User prompt + **requirements** | Existing `design` |
| `section=tasks_md` | User prompt + **requirements** + **design** | Existing `tasks_md` |

- **Tasks tab** — wizard nudges on each layer tab; tab switches blocked until prerequisites exist.
- **Context** — `context_paths` are the session’s `files_in_chat`. Add in the **Spec prompt** with `/add path` (Tab completes on desktop; Enter attaches) or **Add folder** beside the prompt; on **Tasks**, use the context bar or **Open Spec**. Same files as Chat `/add`.
- **All layers** — `section=all` (or **All layers** button) keeps the original one-shot behavior.
- **LLM regression** — `yarn test:llm:core` / `yarn test:e2e:llm` (`spec-generate-all-llm.spec.ts`; optional `spec-generate-phased-llm.spec.ts` when `E2E_SPEC_GEN_PHASED=1`) against Ollama.

## Spec file sync (shipped)

- **To disk** — every todo update writes `.cecli/specs/{id}/requirements.md`, `design.md`, `tasks.md`.
- **From disk** — **Reload from disk** (UI) or `POST …/sync-spec-files` / Tauri `import_todo_spec_files`.

## Gap vs Kiro (tracked in ROADMAP #20–22)

| Kiro | BrightVision today | Roadmap |
|------|-------------------|---------|
| Dedicated spec agent product surface | **Spec** tab (dedicated transcript) + spec-focus + generate/refine jobs | **#20** Partial — vibe/spec session types, hooks |
| EARS validation & formal spec analysis | Validate EARS, trace, lint in generate/refine, apply gate | **#21** Partial — [EARS_MODULE.md](./EARS_MODULE.md) |
| Sync Files / repo-wide spec index | Spec index scan + **Repair folders** | **#22** Partial |
| Unified task progress (checklist ↔ plan) | `cecli/spec/progress.py`, auto-mark on verify/flutter, Tasks **Next** hint | **#53** Done |
| Flutter pubspec hygiene | `bright-vision-tasks repair-pubspec`, implement snapshot hints | **#53** Done |

**Headless task CLI** (after `pip install -e .`):

```bash
bright-vision-tasks --workspace /path/to/repo progress
bright-vision-tasks --workspace /path/to/repo materialize --todo-id <id>
bright-vision-tasks --workspace /path/to/repo sync-agent
bright-vision-tasks --workspace /path/to/repo repair-pubspec --apply
```

HTTP: `GET …/implementation-progress`, `POST …/materialize-checklist`, `POST …/repair-pubspec`, `GET …/steering-files`, `POST …/steering-files/scaffold`.

| Steering files | `.cecli/STEERING.md`, `.cecli/steering/*.md` in spec-focus **and generate-spec** prompts; **Tasks + Spec** tabs show status, **Open STEERING.md**, **Create template** (`bright-vision-tasks steering scan|scaffold`) | Fragment editor / multi-file wizard (longer-term) |
| Repo-grounded spec | **`spec_gen_agent.py`** — repo map, `/agent` read-only explore, auto deepen pass (#53) | Longer: multi-review workflows (EARS E7+) |
| Vibe vs Spec session | **Spec tab → Session mode** (`Vibe` \| `Spec`); spec opens this tab on Start | Per-turn override via Spec focus toggle on Tasks |
| Save → EARS check | `PATCH` returns `ears_*` fields; UI snackbar on regression | Optional file-watcher hook (longer-term) |

## API

See [IPC.md](./IPC.md) for workspace and session todo routes. Patch body accepts `requirements`, `design`, `tasks_md`, `depends_on`.

## Open questions

- TODOs stay **local-only** (gitignored) by default.
- One **active** task per workspace in the UI.
