# EARS module — design & Kiro-depth ladder

**Status:** E1–E7 shipped — lint, index, trace, Tasks UI, generate/refine EARS context + apply gate, spec-agent UX, **cecli lift** (`cecli/spec/`).  
**Roadmap:** [#21](./ROADMAP.md) (linter), [#22](./ROADMAP.md) (repo index), [#20](./ROADMAP.md) (spec-agent UX), **#55** (E7 cecli lift).  
**Related:** [SPEC_DRIVEN_DEV.md](./SPEC_DRIVEN_DEV.md), [CORE_FILE_MERGE.md](./CORE_FILE_MERGE.md) (cecli lift tier).

## Goal

Deepen **EARS** (Easy Approach to Requirements Syntax) support toward **Kiro-level** spec discipline, without bolting logic into React or `http_api.py` blobs. All spec grammar, lint, indexing, and traceability live in a **standalone Python package** that:

1. ~~Ships inside **`bright_vision_core/ears/`** today (Vision / Tasks / HTTP).~~ **Shipped in `cecli/spec/`** (upstream [cecli-dev/cecli#574](https://github.com/cecli-dev/cecli/pull/574)).
2. BrightVision keeps thin HTTP/session shims (`bright_vision_core/ears/` re-exports, `todo_spec_jobs` worker).
3. Exposes a **stable JSON report** for UI, CLI, and future cecli slash commands.

Kiro parity is **immense**; we climb in phases and stop when dogfood value flattens.

## Non-goals (for the module)

- Replacing LLM **Generate / Refine spec** (those call *into* EARS, not the other way around).
- Owning `.cecli/todos.json` persistence (stays `workspace_todos`).
- IDE-only UX (#20) — consumes EARS reports; not part of the package.

## Package layout (E7 — current)

```text
cecli/spec/
  __init__.py
  paths.py         # .cecli/todos.json, specs/, attachments/
  todos.py         # workspace todos + three-layer specs
  markdown.py      # import/export spec markdown
  layers.py        # richness + traceability normalize
  steering.py      # .cecli/steering preamble
  focus.py         # spec-focus inject + implement turns
  generate.py      # generate/refine prompts + parse
  gen_agent.py     # repo-grounded multi-turn spec agent
  implement.py     # implement-step workspace blocks
  agent_todos.py   # cecli agent todo.txt ↔ workspace tasks
  jobs.py          # SpecGenerationJob types + timeout helpers
  job_debug.py     # debug export bundle
  runtime.py       # SpecTurnRunner / AgentTodoSession protocols
  ears/            # EARS lint, index, trace, repair, prompt
```

BrightVision re-exports via `bright_vision_core/{ears,workspace_todos,spec_*,todo_*}` shims; `Session.apply_spec_gen_route` + `todo_spec_jobs.SpecJobStore` stay in the HTTP layer.

## Package layout (pre-E7)

```text
bright_vision_core/ears/
  __init__.py      # public API: analyze_requirements, analyze_spec_folder
  model.py         # EarsClause, EarsIssue, EarsLintResult, Severity, PatternKind
  parse.py         # markdown requirements → clauses (REQ headings, bullets)
  patterns.py      # classify ubiquitous / event / state / unwanted / optional
  lint.py          # rule engine (deterministic, no LLM)
  index.py         # Phase E3: walk .cecli/specs/** (roadmap #22)
  trace.py         # Phase E4: requirements ↔ tasks_md ↔ design links
  report.py        # JSON + human summary for HTTP/UI
```

**Lift rule:** Only `cecli` + stdlib imports inside `cecli/spec/` (no `bright_vision_core`, FastAPI, or Session).

## Public API (stable for cecli)

```python
from bright_vision_core.ears import analyze_requirements, analyze_spec_document

result = analyze_requirements(markdown_text, *, path="requirements.md")
# result.ok, result.issues[], result.clauses[], result.to_dict()
```

Future (same shapes, import path only):

```python
from cecli.spec.ears import analyze_workspace_specs  # when added
```

## Kiro-depth ladder (phases)

| Phase | Name | Deliverable | Roadmap |
|-------|------|-------------|---------|
| **E0** | Contracts | This doc + `model`/`report` types | #21 |
| **E1** | **Lint v1** | Parse REQ blocks; WHEN/SHALL; duplicate IDs; empty section | **#21** |
| **E2** | **Product wiring** | `POST …/lint-requirements`, Tasks **Validate EARS**, Implement blocked on errors | **#21** |
| **E3** | Repo index | Scan `.cecli/specs/**`, cross-task REQ IDs, orphan/missing folders | **#22** (Partial) |
| **E4** | Traceability | Map REQ-00n → design headings → `tasks_md` lines; gap report | **#21** (Partial) |
| **E5** | LLM assist | Generate/refine prompts include lint/trace; `enforce_ears` skips apply on errors | **#21** (Partial) |
| **E6** | Spec agent | **Spec** tab — dedicated transcript + quick generate/refine/EARS/trace | **#20** (Partial) |
| **E7** | **Cecli lift** | **`cecli/spec/`** package; BV shims + Session glue; upstream [cecli-dev#574](https://github.com/cecli-dev/cecli/pull/574) | **Done** (#55) |

**Kiro “immense”** (longer-term, not all in E7): formal conflict detection, multi-spec workspaces, review workflows, versioning, export to external RM tools, rich spec-agent personas. Track as new roadmap rows when E4–E6 dogfood stalls.

## Lint rules (E1 shipped)

| Code | Severity | Rule |
|------|----------|------|
| `EARS_EMPTY` | error | No non-empty requirement clauses |
| `EARS_REQ_ID` | warning | Clause not under `### REQ-…` heading |
| `EARS_DUP_ID` | error | Duplicate `REQ-###` id |
| `EARS_NO_SHALL` | error | Clause mentions requirement intent but no `SHALL` |
| `EARS_NO_SUBJECT` | warning | `SHALL` without `THE … SHALL` subject form |
| `EARS_EVENT_NO_WHEN` | warning | Event-style clause missing `WHEN` |
| `EARS_AMBIGUOUS` | info | Cannot classify pattern (ubiquitous/event/state/…) |

Rules are **regex + structure**, not LLM — suitable for CI and pre-commit later.

## Integration points (E2+)

| Consumer | Hook |
|----------|------|
| **Tasks UI** | Lint on blur / “Validate EARS” button; show `EarsIssue` list under Requirements tab |
| **HTTP** | `POST …/lint-requirements`, `GET …/spec-index`, `POST …/trace-spec` (workspace + session variants) |
| **generate-spec** | Append lint summary to refine prompt; reject `apply: true` on errors (optional flag) |
| **Implement** | Soft warning if active task requirements have errors |
| **Dogfood** | `pytest tests/core/test_ears_*.py`; optional gate in `dogfood:check` |

## Cecli extraction checklist (E7 — done)

- [x] No imports from `bright_vision_core.*` inside `cecli/spec/`
- [x] Tests run as `cecli/tests/spec/` (143 unit tests; `yarn verify:cecli-spec`)
- [x] JSON schema for `EarsLintResult` documented in [IPC.md](./IPC.md)
- [x] Single PR to cecli-dev — [cecli-dev/cecli#574](https://github.com/cecli-dev/cecli/pull/574)
- [x] Parent submodule pin on `dev-integration` (`e9a01c10c`); shims in `bright_vision_core/`

## Suggested fix order (EARS)

1. **E1** — merge lint module + unit tests (this repo).
2. **E2** — HTTP + Tasks UI (dogfoodable).
3. **E3** — spec index (#22).
4. **E4** — traceability matrix.
5. **E5** — wire generate/refine.
6. **E6** — spec-agent UX (#20).
7. **E7** — ~~cecli lift when E1–E4 stable.~~ **Done** — see `cecli/spec/` + #55.
