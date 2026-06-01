# EARS module — design & Kiro-depth ladder

**Status:** E1–E5 shipped — lint, index, trace, Tasks UI, generate/refine EARS context + apply gate; **#20** spec-focus toggle + `.cecli/steering`.  
**Roadmap:** [#21](./ROADMAP.md) (linter), [#22](./ROADMAP.md) (repo index), [#20](./ROADMAP.md) (spec-agent UX).  
**Related:** [SPEC_DRIVEN_DEV.md](./SPEC_DRIVEN_DEV.md), [CORE_FILE_MERGE.md](./CORE_FILE_MERGE.md) (cecli lift tier).

## Goal

Deepen **EARS** (Easy Approach to Requirements Syntax) support toward **Kiro-level** spec discipline, without bolting logic into React or `http_api.py` blobs. All spec grammar, lint, indexing, and traceability live in a **standalone Python package** that:

1. Ships inside **`bright_vision_core/ears/`** today (Vision / Tasks / HTTP).
2. Moves to **`cecli/spec/ears/`** (or `cecli/ears/`) later with **zero** `bright_vision_core` imports.
3. Exposes a **stable JSON report** for UI, CLI, and future cecli slash commands.

Kiro parity is **immense**; we climb in phases and stop when dogfood value flattens.

## Non-goals (for the module)

- Replacing LLM **Generate / Refine spec** (those call *into* EARS, not the other way around).
- Owning `.cecli/todos.json` persistence (stays `workspace_todos`).
- IDE-only UX (#20) — consumes EARS reports; not part of the package.

## Package layout (now)

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

**Lift rule:** Only `cecli` + stdlib imports inside `ears/`. No `fastapi`, `session`, `TodoItem`.

## Public API (stable for cecli)

```python
from bright_vision_core.ears import analyze_requirements, analyze_spec_document

result = analyze_requirements(markdown_text, *, path="requirements.md")
# result.ok, result.issues[], result.clauses[], result.to_dict()
```

Future:

```python
from cecli.spec.ears import analyze_workspace_specs  # same shapes
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
| **E7** | Cecli lift | Copy package to `cecli/spec/ears/`; BV pins cecli; thin HTTP wrapper | CECLI_PIN |

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

## Cecli extraction checklist

Before moving tree to cecli:

- [ ] No imports from `bright_vision_core.*` inside `ears/`
- [ ] Tests run as `tests/cecli/test_ears_*.py` or `cecli/tests/spec/`
- [ ] JSON schema for `EarsLintResult` documented in [IPC.md](./IPC.md)
- [ ] Single PR to Digital-Defiance/cecli `main` (not `dev-integration` merge)
- [ ] Parent submodule pin + `test_cecli_tool_json`-style gate for `import cecli.spec.ears`

## Suggested fix order (EARS)

1. **E1** — merge lint module + unit tests (this repo).
2. **E2** — HTTP + Tasks UI (dogfoodable).
3. **E3** — spec index (#22).
4. **E4** — traceability matrix.
5. **E5** — wire generate/refine.
6. **E6** — spec-agent UX (#20).
7. **E7** — cecli lift when E1–E4 stable.
