# E2E coverage vs roadmap

Playwright runs **locally** against **Vite preview** (`E2E=1`) with a **mocked** `/api/core` HTTP API. **Desktop parity** uses a **mocked Tauri `invoke` bridge** (`e2e/helpers/mockTauri.ts`) — not a real `yarn tauri` binary (see [Real desktop smoke](#real-desktop-smoke) below).

Run: `yarn test:full` or `sh scripts/test-local.sh full`. CI is optional.

| Roadmap | Status in product | E2E / tests |
|---------|-------------------|-------------|
| **Core lifecycle** | Done | `session-lifecycle.spec.ts` |
| **#1–2, #8–11, #13, #25** Chat UX | Done | `chat-ux.spec.ts` |
| **#3–5** Queue / stop / multiline | Done | `chat-input.spec.ts` |
| **#7** Confirm | Done | `confirm-flow.spec.ts` |
| **#12** `/add` Tab paths | Done (Tauri) | `path-completion.spec.ts` (mock Tauri) |
| **#16** Images/PDF | Done | `file-upload.spec.ts` (web upload + mock native pick) |
| **#17** Prompt before commit | Done | `settings-config.spec.ts` |
| **#18** Tasks / generate-spec | Done | `tasks-workspace.spec.ts` |
| **#19** Submodule verify | Done | `release-hygiene.spec.ts` (+ `yarn verify:submodule` when `.venv` exists) |
| **#23–24** Process + chat | Done | lifecycle + chat suites |
| **#26** Git poll (not inotify) | Partial | `git-polling.spec.ts`, `src/hooks/useGitStatus.test.ts` |
| **#27** Git visualization | Done (desktop) | `tauri-git.spec.ts` (mock Tauri) |
| **#28** Context attach | Partial | `chat-context.spec.ts`, `roadmap-gaps.spec.ts` |
| **#30** Web parity | Partial | context + settings + path-completion (web branch) |
| **#31** Release hygiene | Operator | `release-hygiene.spec.ts` (docs, submodule, optional verify) |
| **#20–22** Kiro-depth spec | Open | `roadmap-gaps.spec.ts` (buttons only) |
| **#29** Plugins | Longer-term | — |

## Helpers

| Helper | Role |
|--------|------|
| `mockCoreApi.ts` | Health, sessions, SSE, todos, **files/upload** |
| `mockTauri.ts` | `git_*`, `complete_workspace_path`, `pick_and_stage_chat_images`, … |
| `tauriFixtures.ts` | Sample git graph / status / path list |
| `session.ts` | `startMockSession({ tauri: true })`, tab navigation |
| `fixtures.ts` / `sse.ts` / `testConfig.ts` | SSE turns, config priming |

## Real desktop smoke

Not part of default Playwright (requires display + built app):

```bash
yarn tauri dev
# Terminal Start/Stop, Git tab, /add Tab, attach images, Tasks generate-spec
```

Future option: [Tauri WebDriver](https://tauri.app/develop/tests/webdriver/) or `tauri-driver` in a separate job.

## Adding tests

1. Extend `mockCoreApi` / `mockTauri` handlers for new commands or routes.
2. Prefer `data-testid` only when roles/labels are ambiguous.
3. Update this table and `docs/TESTING.md`.
