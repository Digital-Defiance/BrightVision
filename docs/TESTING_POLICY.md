# Testing policy (features & roadmap)

Every **shipped** roadmap item should have a **documented verification path**. Prefer automation; manual steps are allowed only when automation is impractical (native OS dialogs, subjective UX, full LLM turns).

## Definition of done (testing)

Before setting a roadmap row to **Done**:

1. **Pick a tier** (one primary; add secondary if cheap):

   | Tier | Command | Proves |
   |------|---------|--------|
   | Unit | `yarn test` / `pytest tests/core/…` | Parsers, policy, HTTP handlers, pure logic |
   | Integration | `yarn test:e2e:integration` + `test_http_*` | Live Vision API `:8741`, workspace files |
   | Mocked E2E | `yarn test:e2e` | React + mocked `/api/core` (+ mock Tauri when needed) |
   | Agent dogfood | `yarn dogfood:agent` | Headless gate: check + release tier + integration |
   | Manual | [SUBMODULE_VERIFICATION.md](./SUBMODULE_VERIFICATION.md), `yarn tauri dev` | Native shell spot-check (release only) |

2. **Update** [e2e/ROADMAP_COVERAGE.md](../e2e/ROADMAP_COVERAGE.md) with the spec file or pytest module.

3. **Residual gaps** (fuzzy apply, inotify, LLM-only flows) stay **Open** rows or bullets — do not leave the parent item **Partial** when automation for the shipped slice is complete.

## What stays manual (by design)

- **Real Ollama chat** — `yarn test:e2e:llm`, `yarn test:llm:core` (opt-in). Lanes: hello, agent, context, router, todo list, edit block, transcript; superproject root only with `E2E_SUPERPROJECT_LLM=1`.
- **Agent dogfood (primary)** — `yarn dogfood:agent`; add `DOGFOOD_LLM=1` when Ollama is running.
- **Real Tauri binary** — file pickers, keychain, DMG smoke (`yarn tauri dev`) — optional, not daily dogfood.
- **#19 release spot-check** — SUBMODULE_VERIFICATION A–D in GUI when shipping native builds; daily bar is `yarn dogfood:agent`.

## Local tiers

See [TESTING.md](./TESTING.md). **`sh scripts/test-local.sh release`** runs mocked e2e, **bright-core pytest**, **integration e2e**, and **verify:submodule** when `.venv` exists.

## Adding tests

1. **Shipped feature?** Register an SSE scenario in `e2e/helpers/scenarios.ts` and assert output in `e2e/shipped-scenarios.spec.ts`.
2. **Need real files?** Add `ensure*Workspace()` in `e2e/helpers/fixtureWorkspaces.ts` and document in `e2e/fixtures/README.md`.
3. Extend `mockCoreApi.ts` / `mockTauri.ts` for new routes or `invoke` commands.
4. Prefer roles/labels; use `data-testid` when ambiguous.
5. For workspace file behavior, prefer `tests/core/` or `yarn test:e2e:integration` over mocks alone.
