# BrightVision Remote (Expo)

Phone companion for the Vision HTTP API on your laptop. See [docs/MOBILE_REMOTE.md](../../docs/MOBILE_REMOTE.md).

## R0 dogfood (current)

1. On desktop: **Settings → BrightVision Remote (LAN Link)** — enable, Start Vision API, scan QR.
2. Install deps from repo root: `yarn install`
3. Run: `yarn remote:dev`
4. Open Expo Go on the same Wi‑Fi; paste pairing JSON or enter URL + token; **Ping /health**.

## Scripts

| Command | Purpose |
|---------|---------|
| `yarn remote:dev` | `expo start` from repo root |
| `yarn remote:android` | `yarn workspace @brightvision/remote android` |

Chat UI and mDNS discovery are **R2+** in the mobile roadmap; this app only validates connectivity for now.
