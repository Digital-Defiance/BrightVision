# E2E coverage vs roadmap

Playwright runs **locally** against **Vite preview** (`E2E=1`) with a **mocked** `/api/core` HTTP API. **Desktop parity** uses a **mocked Tauri `invoke` bridge** (`e2e/helpers/mockTauri.ts`) — not a real `yarn tauri` binary (see [Real desktop smoke](#real-desktop-smoke) below).

Run: `yarn test:full` or `sh scripts/test-local.sh full`. **Release tier:** `sh scripts/test-local.sh release` (adds bright-core pytest + integration e2e when `.venv` exists).

**Fixture catalog:** [e2e/fixtures/README.md](./fixtures/README.md) · **Feature index:** [SHIPPED_FEATURES.md](./SHIPPED_FEATURES.md) · **Scenario matrix:** `e2e/shipped-scenarios.spec.ts` (every registered SSE scenario + expected UI output).

**Policy:** [docs/TESTING_POLICY.md](../docs/TESTING_POLICY.md)

| Roadmap | Status in product | E2E / tests |
|---------|-------------------|-------------|
| **Core lifecycle** | Done | `session-lifecycle.spec.ts`, `ingestProgress.test.ts` (progress SSE → activity bar) |
| **#1–2, #8–11, #13, #25** Chat UX | Done | `chat-ux.spec.ts`, `chat-parsing.spec.ts`, `stream-chat.spec.ts`, `proposed-edits-apply.spec.ts`, `applyProposedEdit.test.ts`, `proposedEdits.test.ts`, scenarios `display-fence` / `applied-edit` |
| **#3–5** Queue / stop / multiline | Done | `chat-input.spec.ts` (`helpers/chatSend.ts`, `chatStream.test.ts`) |
| **#7** Confirm | Done | `confirm-flow.spec.ts` |
| **#12** `/add` Tab paths | Done (Tauri) | `path-completion.spec.ts` (mock Tauri) |
| **#16** Images/PDF | Done | `file-upload.spec.ts` |
| **#17** Prompt before commit | Done | `settings-config.spec.ts` |
| **#18** Tasks / generate-spec | Done | `tasks-workspace.spec.ts`, `tasks-generate-spec.spec.ts` (activity bar, ears_blocked) |
| **#23** Phased spec wizard | Done | `tasks-spec-wizard.spec.ts` (tab gates, nudges, per-section POST, All layers) |
| **#19** Submodule / superproject | Done (automated) | `yarn dogfood:agent`, `test_superproject_dogfood.py`, `release-hygiene.spec.ts`, `test_git_workspace.py`, `test_superproject_integration.py`, `yarn verify:submodule`; LLM: `superproject-llm` (opt-in); **optional GUI:** [SUBMODULE_VERIFICATION.md](../docs/SUBMODULE_VERIFICATION.md) A–D |
| **#23–24** Process + chat | Done | lifecycle + chat suites |
| **#26** Git poll (not inotify) | Partial | `git-polling.spec.ts`, `useGitStatus.test.ts` — **Open:** native FS watcher |
| **#27** Git visualization | Done (desktop) | `tauri-git.spec.ts` (mock Tauri) |
| **#28** Context attach | Done (automated) | `chat-context.spec.ts`, `suggested-files.spec.ts`, `session-context.spec.ts` — **Open:** modified-file highlights |
| **#32** Suggested files | Done | `suggestedFiles.test.ts`, `suggested-files.spec.ts` (tray, add all, open in editor) |
| **#34** Thinking timers | Done | `thinkingTiming.test.ts`, `chat-ux.spec.ts` (`thinking-timer`) |
| **#35** Context / file counter | Done | `contextUsage.test.ts`, `session-context.spec.ts` |
| **#36** LLM ping | Done | `local-llm-ping.spec.ts`, mock `llm_ping` |
| **#33** Resource overlay | Done | `resource-overlay.spec.ts` — **Open:** process-scoped CPU, non-NVIDIA GPU |
| **#40** cecli agents in Vision | Done (v1) | `agents-bar.spec.ts`, mock `GET …/subagents` — **Open:** `POST …/agents/invoke`, header pill |
| **#42** Mobile alerts (ntfy) | Done | `ntfy-alerts.spec.ts` — settings ping, turn-`done`, spec job push (mock Tauri) |
| **Real LLM hello** | Opt-in | `hello-llm.spec.ts`, `agent-llm.spec.ts`, `test_hello_llm.py`, `test_agent_llm.py` |
| **Real LLM + file context** | Opt-in | `context-llm.spec.ts`, `test_context_llm.py` — `e2e/fixtures/context-workspace` |
| **Real core integration** | Done | `yarn test:e2e:integration`; `test_http_agent_todo_import.py`, `test_agent_todos.py` |
| **#30** Web parity | Partial | context + settings + path-completion web branch — **Open:** `/add` Tab on web-only |
| **#31** Release hygiene | Done (automated) | `release-hygiene.spec.ts`, [RELEASE.md](../docs/RELEASE.md) operator steps |
| **#33** Session persistence | Partial | `settings-config.spec.ts`, `session-transcript-hydrate.spec.ts`, `shipped-scenarios` (`session-transcript`), `test_session_*` — **Open:** encrypt `chat.history` |
| **#20–22** Kiro-depth spec | Partial | `spec-agent.spec.ts`, `tasks-ears-index.spec.ts`, `tasks-generate-spec.spec.ts`, `tasks-spec-wizard.spec.ts`; pytest `test_ears_index.py`, `test_workspace_todos.py` (prune/delete spec folders) |
| **#29** Plugins | Longer-term | — |

## Helpers

| Helper | Role |
|--------|------|
| `mockCoreApi.ts` | Health, sessions, SSE, todos, subagents, files/upload |
| `mockTauri.ts` | `git_*`, workspace I/O, `ntfy_send_push`, `llm_ping`, … |
| `tauriFixtures.ts` | Sample git graph / status / path list |
| `session.ts` | `startMockSession({ tauri: true })`, tab navigation |
| `integrationEnv.ts` / `integrationSession.ts` | Real core on `:8741` (no mock API; no mock Tauri) |
| `chatSend.ts` | Optimistic send assertions |
| `fixtures.ts` / `sse.ts` / `testConfig.ts` | SSE turns, config priming |
| `scenarios.ts` / `fixtureWorkspaces.ts` | Named scenarios + git workspaces with deterministic outputs |
| `primeScenarioConfig.ts` | Per-scenario localStorage (e.g. auto-load) |

## Real desktop smoke

Not part of default Playwright (requires display + built app):

```bash
yarn tauri dev
# Terminal Start/Stop, Git tab, /add Tab, attach images, Tasks generate-spec
```

### Real core integration (no mocked `/api/core`)

```bash
source activate.sh
yarn test:e2e:integration
```

| Suite | What it proves |
|-------|----------------|
| `integration/core-health.spec.ts` | Health, session create, import-agent-plan HTTP |
| `integration/agent-todo-sync.spec.ts` | Agent `todo.txt` → Tasks tab + `.cecli/todos.json` |
| `integration/import-agent-plan.spec.ts` | import-agent-plan HTTP + on-disk todos |
| `integration/tasks-seeded-workspace.spec.ts` | GET `/workspaces/todos` from `tasks-seeded-workspace` fixture |

Also: `yarn test:bright-core` (includes `test_agent_todos.py`, `test_http_agent_todo_import.py`).

## Adding tests

1. Extend `mockCoreApi` / `mockTauri` handlers for new commands or routes.
2. Prefer `data-testid` only when roles/labels are ambiguous.
3. Update this table and [docs/TESTING.md](./TESTING.md).
