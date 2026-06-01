# E2E fixture workspaces & SSE scenarios

BrightVision e2e uses two layers:

| Layer | Purpose | Location |
|-------|---------|----------|
| **SSE scenarios** | Deterministic mocked core turns (UI output) | `e2e/helpers/scenarios.ts`, `e2e/helpers/fixtures.ts` |
| **Git workspaces** | Real files on disk (`/add`, apply, integration HTTP) | `e2e/fixtures/*-workspace/` |

## Fixture packs (tailor-made repos)

For deterministic LLM checks, you can point e2e at an external fixture collection:

```bash
E2E_FIXTURE_PACK_ROOT=/absolute/path/to/my-fixture-pack
```

If a workspace exists in that folder (for example `context-workspace`, `hello-workspace`), BrightVision e2e uses it instead of the in-repo fallback under `e2e/fixtures`.

Recommended layout:

- Keep a small dedicated repo with one folder per scenario/workspace.
- Optionally keep that repo as a submodule in your superproject (for reproducible fixture revisions).
- Pin fixture commits when changing expected-output assertions.

Preflight check:

```bash
# Uses E2E_FIXTURE_PACK_ROOT when set; otherwise validates in-repo fixtures.
yarn test:e2e:fixtures
# or explicit path:
sh scripts/verify-e2e-fixture-pack.sh /absolute/path/to/my-fixture-pack
```

## Git workspaces

| Workspace | Created by | Produces |
|-----------|------------|----------|
| `context-workspace` | `ensureContextLlmE2eWorkspace()` | LLM read-back of `E2E_CONTEXT_MAGIC` in `src/e2e_widget.ts` |
| `hello-workspace` | `ensureHelloLlmE2eWorkspace()` | Smoke LLM reply (minimal repo) |
| `integration-workspace` | `ensureIntegrationWorkspace()` | Real `:8741` HTTP + agent `todo.txt` import (incl. char-split recovery via `writeCharSplitCorruptedAgentTodoFile()` in `e2e/helpers/integrationEnv.ts`; spec `e2e/integration/import-agent-plan.spec.ts`) |
| `edit-block-workspace` | `ensureEditBlockWorkspace()` | `src/patchme.ts` with `value = 'old'` for SEARCH/REPLACE apply |
| `tasks-seeded-workspace` | `ensureTasksSeededWorkspace()` | Pre-filled `.cecli/todos.json` for Tasks tab / workspace API |

Workspaces are **git repos** (initialized on first use). Re-init:

```bash
sh scripts/init-e2e-fixture.sh edit-block-workspace
```

## SSE scenarios (mocked `/api/core`)

Registered in `e2e/helpers/scenarios.ts`. Used by `e2e/shipped-scenarios.spec.ts`.

| Scenario | Expected UI signal |
|----------|-------------------|
| `default` | Answer chip, token stats |
| `proposed-edit` | Proposed only + apply |
| `confirm` | Yes/No confirm |
| `suggested-files` | Suggested files tray |
| `cumulative-stream` | No doubled stream text |
| `scan-progress` | Activity progress |
| `empty-llm` | Empty LLM warning + retry |
| `session-transcript` | Prior user bubble after auto-load |

## Opt-in LLM (Ollama)

```bash
yarn test:e2e:llm          # hello + agent + context workspaces
yarn test:llm:core        # pytest on same fixtures
```

## Real core integration

```bash
source activate.sh
yarn test:e2e:integration
```

## Adding a workspace

1. Add `ensureMyWorkspace()` in `e2e/helpers/fixtureWorkspaces.ts`.
2. Document the row in this file.
3. Add integration or mocked test that asserts the **specific output** you need.
4. Update `e2e/ROADMAP_COVERAGE.md`.
