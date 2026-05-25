# Testing (local-first)

All checks run on **your machine**. Nothing here requires GitHub Actions — workflow files under `.github/workflows/` stay in the repo for optional use later.

## Quick reference

| When | Command | Rough time |
|------|---------|------------|
| After a small TS/UI change | `yarn test:fast` | ~5s |
| Before pushing (default) | `yarn test:local` | ~15s |
| Before a larger UI/session change | `yarn test:full` | ~1–2 min |
| Before a release / submodule bump | `sh scripts/test-local.sh release` | full + verify |

Same tiers via shell:

```bash
sh scripts/test-local.sh fast      # tsc + Vitest
sh scripts/test-local.sh local     # + Rust
sh scripts/test-local.sh full      # + Playwright e2e
sh scripts/test-local.sh release     # + verify:submodule if .venv exists
```

## One-time setup

```bash
yarn install
npx playwright install chromium   # only needed for test:e2e / test:full
```

With core Python work:

```bash
source activate.sh   # creates .venv for verify:submodule
```

## Unit tests (Vitest)

```bash
yarn test
# watch mode while developing:
yarn test:watch
```

Covers chat stream parsing (including optimistic user-message reconcile), commit graph layout, auto-stage policy, session lifecycle, git labels.

## Rust (Tauri git_ops)

```bash
yarn test:rust
```

Included in `yarn test:local` and `yarn test:full`.

## End-to-end (Playwright)

Browser tests use **Vite preview** with a **mocked** `/api/core` API and optional **mocked Tauri** `invoke` (no real desktop shell, no real `:8741` server).

```bash
yarn test:e2e
```

**Coverage matrix:** [e2e/ROADMAP_COVERAGE.md](../e2e/ROADMAP_COVERAGE.md)

| Suite | Area |
|-------|------|
| `session-lifecycle.spec.ts` | Start/stop, connecting, health recovery |
| `navigation.spec.ts` | Main tabs |
| `chat-ux.spec.ts` | Sections, proposed edits, token stats; optimistic user bubble on send |
| `chat-input.spec.ts` | Send clears input + user bubble; queue, stop turn, multiline |
| `confirm-flow.spec.ts` | Confirm banner |
| `chat-context.spec.ts` | Folder attach |
| `tasks-workspace.spec.ts` | Tasks + generate-spec |
| `settings-config.spec.ts` | Settings persistence |
| `tauri-git.spec.ts` | Git panel (mock Tauri) |
| `path-completion.spec.ts` | `/add` Tab (desktop vs web) |
| `file-upload.spec.ts` | Upload + native attach mock |
| `git-polling.spec.ts` | 8s git status poll |
| `release-hygiene.spec.ts` | RELEASE / submodule file checks |
| `roadmap-gaps.spec.ts` | Open roadmap smoke |

Helpers live in `e2e/helpers/` (`mockCoreApi`, `mockTauri`, `session`, `fixtures`, `testConfig`).

Use `startMockSession(page, { tauri: true })` for desktop-only UI in the browser.

### Useful e2e commands

```bash
yarn test:e2e                                    # all (~44 tests)
yarn playwright test e2e/session-lifecycle.spec.ts
yarn playwright test --ui                        # debug interactively
```

Preview reuses an existing server when not in CI (`reuseExistingServer` in `playwright.config.ts`), so a second run can be faster after the first build.

## Manual smoke (not Playwright)

After `yarn test:full`, when you change engine or desktop integration:

```bash
source activate.sh
yarn tauri dev
```

Check: Terminal Start/Stop, Chat send, Tasks tab, Git tab (real `git`), attach images.

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) if the session sticks on **Connecting**.

## Core Python (optional)

```bash
yarn test:git-workspace
yarn verify:submodule          # needs .venv — also in test-local.sh release
cd aider-vision-core && python -m pytest tests/ -q
```

## Script aliases

| Script | Same as |
|--------|---------|
| `yarn test:fast` | `test-local.sh fast` |
| `yarn test:local` | `test-local.sh local` |
| `yarn test:full` | `test-local.sh full` |
| `yarn test:all` | `yarn test:full` (alias) |

## What stays manual

- Real `yarn tauri` + OS dialogs and true git binary (e2e uses mocks)
- Native FS notify (#26) — app uses periodic git poll; see `git-polling.spec.ts`
- Git tag / submodule pointer bump (#31) — [RELEASE.md](./RELEASE.md)
