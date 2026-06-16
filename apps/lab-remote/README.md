# BrightVision Lab Remote (Expo)

Phone companion for **Test Lab** suite progress on your laptop. Shows step and sub-step status over the same Wi‑Fi — no log streaming.

## Setup

1. From repo root: `yarn install` (uses `node_modules` linker — required for Expo).
2. On laptop: **Test Lab** → **Lab Remote** → enable LAN proxy → scan QR.
3. Run: `yarn lab-remote:dev`
4. Open **Expo Go (SDK 54)** on the same Wi‑Fi; tap **Scan Test Lab QR** on the Connect tab (or paste pairing JSON).

## Scripts

| Command | Purpose |
|---------|---------|
| `yarn lab-remote:dev` | `expo start` for Lab Remote |
| `yarn lab-remote:android` | `yarn workspace @brightvision/lab-remote android` |

Shared client: `packages/test-suite-client` (`@brightvision/test-suite-client`).

## Ports

| Port | Service |
|------|---------|
| 8743 | Test orchestrator (loopback) |
| 8744 | Lab Remote LAN proxy (default) |

See [apps/test-lab/README.md](../test-lab/README.md).
