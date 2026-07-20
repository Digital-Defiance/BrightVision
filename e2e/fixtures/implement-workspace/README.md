# E2E implement workspace

Purpose-built **generic** repo for implement-turn inject tests — not tied to any dogfood project layout.

| File | Role |
|------|------|
| `package.json` | Top-level marker (orientation snapshot) |
| `src/auth/service.ts` | Existing module (resume / orientation) |
| `src/auth/token.ts` | Named-path step target — **not** on disk until implement turn |
| `src/api/handler.ts` | Resume scenario — step 1 deliverable on disk |
| `lib/.gitkeep` | Extra top-level directory for snapshot listing |

Todo payloads live in `e2e/helpers/implementFixture.ts`; `ensureImplementWorkspace()` seeds `.cecli/todos.json` per scenario.
