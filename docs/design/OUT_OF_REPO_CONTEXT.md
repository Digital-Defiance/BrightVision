# Out-of-repo context (deferred — #7)

## Goal

Allow attaching files **outside** the open git project (like Cursor’s `@/absolute/path`), not only workspace-relative paths.

## Constraints today

- Vision session `add_files` resolves paths under `coder.root` (workspace).
- Tauri folder picker returns absolute paths; expansion only walks inside the workspace.
- Security: arbitrary file read increases exfil risk; must be explicit user action per path.

## Options (for discussion)

| Approach | Effort | Notes |
|----------|--------|-------|
| **A. Upload / attach API** | Medium | `POST /files/upload` already accepts base64 content; desktop picker → upload blobs without placing files in repo. Best parity with “external context”. |
| **B. Read-only attach prefix** | Medium | Core stores under `.cecli/attachments/…` (existing prefix); UI copies picked file into workspace attach dir via Tauri. |
| **C. Symlink / bridge path** | High | Allow listed absolute paths in session config; cecli must honor without breaking repo map. |
| **D. No change** | — | Document “open project folder as workspace” only. |

## Recommendation

Ship **A** first (upload from native file picker for any path), then **B** for large trees. Avoid **C** until cecli agent tools respect an allowlist.

## Not in scope until decided

No implementation in BrightVision until product picks A/B/C and threat model (per-path consent, session banner, size caps).
