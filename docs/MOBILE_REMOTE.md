# BrightVision Remote (mobile companion)

**For agents:** This file is the execution spec for roadmap **#45**. Read it end-to-end before writing code. Product vision is below; **§ Agent execution** is what you implement and verify.

**For humans:** Two apps only on the phone path (desktop + Remote) — no VPN, SSH, or ntfy required for the default remote story.

The phone is a **light client** to the **Vision HTTP API** (`docs/IPC.md`). The laptop runs Cecli, LLM, and git.

---

## Agent execution (start here)

### Copy-paste prompt — R0–R1 only

Use this when kicking off implementation (in-repo, no Connect, no App Store):

```text
Work roadmap #45 phases R0–R1 only in-repo: extract packages/vision-client, scaffold apps/remote (Expo), desktop LAN pairing (token + QR + local proxy to :8741). No Connect relay, no App Store. Follow docs/MOBILE_REMOTE.md.
```

### Copy-paste prompt — R2+

After R0–R1 acceptance criteria pass:

```text
Work roadmap #45 phases R2+ only: BrightVision Connect relay, Remote chat (SSE + confirm + stop), then tasks read. Follow docs/MOBILE_REMOTE.md. Do not re-scaffold vision-client/remote unless broken.
```

### Prerequisites (agent checks before coding)

| Check | How |
|-------|-----|
| Vision API contract | `docs/IPC.md` — especially `/health`, sessions, messages (SSE), `/confirm`, interrupt |
| Auth for LAN | `bright_vision_core/http_auth.py` — `BRIGHT_VISION_TOKEN`; non-loopback bind requires token |
| Desktop reference UI | `src/ipc/httpClient.ts`, `src/hooks/useVisionSession.ts`, `src/ipc/events.ts` |
| Engine not on phone | No Cecli/Ollama in `apps/remote`; HTTP only |
| Repo layout | Monorepo — **not** git submodules for mobile (see § Repository layout) |

**Optional head start:** A partial scaffold may already exist (`packages/vision-client/`, `apps/remote/`, Settings LAN section, `src-tauri/lan_remote.rs`). **Treat it as unverified** until acceptance criteria below pass; fix or replace rather than assume done.

### Repository layout (in this repo)

```text
BrightVision/
  packages/vision-client/   # @brightvision/vision-client — HTTP, SSE, events (shared)
  apps/remote/              # Expo — Android + iOS from one tree
  src/ + src-tauri/         # Desktop LAN pairing UI + local proxy (R1)
  bright_vision_core/       # Vision API (unchanged contract)
  cecli/                    # submodule only — do not depend from mobile
```

| Piece | Submodule? |
|-------|------------|
| `cecli/` | **Yes** (upstream pin) |
| `packages/vision-client`, `apps/remote`, desktop LAN | **No** (first-party) |

### Phase R0 — dev dogfood (no mDNS yet)

**Goal:** Phone (or Expo) can call `GET /health` on the laptop API with optional Bearer token.

| Task | Owner | Notes |
|------|--------|--------|
| Extract `packages/vision-client` from `src/ipc/` | Agent | `CoreHttpClient`, `events.ts`, SSE helpers; desktop re-exports package |
| `yarn workspaces` + `@brightvision/vision-client` in root | Agent | Vite/TS path alias |
| Scaffold `apps/remote` (Expo, TypeScript) | Agent | Manual URL + token + paste QR JSON; **Ping /health** screen |
| Desktop: Settings token field wired to `BRIGHT_VISION_TOKEN` on spawn | Agent | `start_core_api` passes token env when set |
| Docs + `AGENTS.md` repo table row | Agent | Link this file |

**Acceptance criteria (R0)**

- [ ] `yarn test:vision-client` green (at least LAN pairing JSON + client unit tests).
- [ ] `yarn test:fast` green (desktop still builds; re-exports resolve).
- [ ] With `bright-vision-core-serve` on loopback and token set, Expo app **Ping /health** succeeds on same machine (manual URL `http://127.0.0.1:8741` or LAN URL after R1).
- [ ] No Connect relay, no store signing, no chat UI required.

**Dogfood (R0):** Laptop serves API → phone enters URL + token from Settings → health OK.

---

### Phase R1 — LAN Link (same Wi‑Fi)

**Goal:** Phone on LAN reaches loopback Vision API via a **local proxy** + **QR pairing**; optional mDNS advertise.

| Task | Owner | Notes |
|------|--------|--------|
| Local HTTP proxy on LAN (e.g. `:8742` → `127.0.0.1:8741`) | Agent | Require Bearer except `/health`; core stays loopback |
| Settings: **BrightVision Remote (LAN Link)** — toggle, generate token, QR | Agent | QR JSON: `{ v, lanUrl, token, deviceName, fingerprint? }` |
| mDNS `_brightvision._tcp` (desktop) | Agent | Optional for R1 if QR-only ships first; list in Remote is R1.5 |
| Pass `BRIGHT_VISION_TOKEN` when starting core if LAN enabled | Agent | Restart API after token rotation |
| `apps/remote`: parse QR payload (`parseLanPairingQr`) | Agent | Already specified in vision-client |

**LAN URL shape:** `http://<lan-ipv4>:8742` (proxy port), **not** raw `:8741` on `0.0.0.0`.

**Acceptance criteria (R1)**

- [ ] Enable LAN Link → Start Vision API → QR scans into Expo → **Ping /health** succeeds from phone on same Wi‑Fi.
- [ ] Without token, proxied routes return 401; `/health` works without auth (matches core policy).
- [ ] `yarn test:local` green (Rust proxy compiles; `cargo test` in `src-tauri`).
- [ ] E2E: Settings section visible (`e2e/mobile-remote-lan.spec.ts` or equivalent).

**Dogfood (R1):** Settings → LAN Link on → scan QR with Expo → health OK from phone.

---

### Phase R2+ (out of R0–R1 scope)

Do **not** start until R1 acceptance criteria are checked off in `docs/ROADMAP.md` **#45**.

| Phase | Deliverable | Infra |
|-------|-------------|-------|
| **R2** | Connect relay + pairing code; Remote chat (SSE, confirm, stop) | `connect/` service |
| **R3** | Tasks list, active task, spec read | Same relay |
| **R4** | Push via Connect (FCM/APNs); no ntfy app required | Push bridge |
| **R5** | Git strip on Remote | Vision git HTTP APIs |

### What agents must not do

- Submodule `apps/remote` into BrightVision.
- Run Cecli or Ollama on the phone.
- Expose `:8741` on `0.0.0.0` without token (use proxy + `BRIGHT_VISION_TOKEN`).
- Build Connect or App Store submission in an R0–R1 task.
- Change `docs/IPC.md` without updating core + `vision-client` + desktop in one PR.

### Tests (by phase)

| Tier | Command | When |
|------|---------|------|
| Vision client | `yarn test:vision-client` | After `packages/vision-client` changes |
| Desktop TS | `yarn test:fast` | After `src/` / package wiring |
| Rust shell | `yarn test:rust` | After `src-tauri/` LAN proxy |
| E2E | `yarn test:e2e` (mobile-remote-lan spec) | After Settings LAN UI |
| Manual | `yarn remote:dev` + desktop LAN QR | R0–R1 dogfood |

### ROADMAP updates

When a phase meets **all** acceptance criteria, set **#45** note in `docs/ROADMAP.md` (e.g. “R0 done”, “R1 done”). Do not mark **Done** for the whole Remote epic until R2+ product scope is agreed.

---

## User promise

| Install | Required? |
|---------|-----------|
| BrightVision (macOS / Linux desktop) | Yes |
| BrightVision Remote (Android / iOS) | Yes |
| VPN, SSH, router config, third-party tunnel account | **No** |

**Same Wi‑Fi:** open Remote → tap discovered laptop or scan QR.  
**Away from home:** laptop **Remote access** on → phone enters **6-digit code** or scans QR (Connect — R2+).

---

## Connectivity modes

### 1. LAN Link (zero BrightVision servers) — R1

- Desktop advertises `_brightvision._tcp` (mDNS) and shows QR `{ lanUrl, token, deviceName }`.
- Phone talks to **LAN proxy port** (e.g. 8742) → forwards to `127.0.0.1:8741`.
- **Infra:** none.

### 2. BrightVision Connect (off-LAN) — R2+

- Laptop **outbound** WebSocket to relay; phone uses pairing code.
- Proxies authenticated HTTP/SSE to local Vision API.
- **Infra:** one lean pairing + relay service (not zero servers, but zero **user** installs).

```text
[Phone] ──► Connect (pair + proxy) ◄── outbound WSS ── [Laptop]
              └── proxied to 127.0.0.1:8741 (Bearer)
```

---

## Security

| Rule | Implementation |
|------|----------------|
| API secret | `BRIGHT_VISION_TOKEN`; phone stores in secure storage |
| LAN | QR carries token; proxy validates Bearer |
| Core bind | Stay on loopback; LAN via proxy only |
| Off-LAN (R2+) | TLS on Connect; pairing code + token |
| Transport on LAN | HTTP on private Wi‑Fi (document risk in store copy later) |

---

## Desktop vs mobile scope

### Desktop (Tauri) — R1 minimum

| Feature | Phase |
|---------|--------|
| Token generate / show / rotate | R0–R1 |
| LAN proxy + QR | R1 |
| mDNS advertise | R1 (or R1.5) |
| Connect agent | R2+ |

### Mobile (Expo) — R0–R1 minimum

| Screen | Phase |
|--------|--------|
| Manual URL + token + paste QR | R0 |
| Health ping | R0 |
| Nearby devices (mDNS) | R1.5+ |
| Chat, confirm, stop | R2+ |
| Tasks / spec read | R3+ |

**Shared types:** `@brightvision/vision-client` (from `src/ipc/events.ts` shapes). Desktop may keep re-export shims in `src/ipc/`.

### Notifications

Default Remote path (R4): push via Connect. **ntfy** remains optional ([MOBILE_ALERTS.md](./MOBILE_ALERTS.md)) — separate app install.

---

## Pairing flows

### LAN (desk)

1. Laptop: Vision API running; **Settings → BrightVision Remote (LAN Link)** on.
2. Phone: scan QR or enter URL + token.
3. Save profile; later R2+ adds named computers list.

### Connect (R2+)

1. Laptop: **Remote access** on → code + QR.
2. Phone: enter code → stored profile → chat over cellular.

---

## Deliberately not default

| Approach | Why |
|----------|-----|
| Tailscale / WireGuard | Extra install |
| SSH | Power-user only |
| Port-forward `:8741` | Too powerful on public internet |
| User ngrok / Cloudflare accounts | Extra product surface |

---

## Store positioning (R2+ later)

Developer companion controlling **your** machine; disclose Connect routing off-LAN.

---

## Related docs

- [IPC.md](./IPC.md) — API contract
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [MOBILE_ALERTS.md](./MOBILE_ALERTS.md) — optional ntfy
- [ROADMAP.md](./ROADMAP.md) — **#45**
- `bright_vision_core/http_auth.py`

---

## Summary

**Product:** Two apps; LAN at home (no cloud); Connect when away (minimal relay).  
**Agents:** Implement **R0 → R1** using § Agent execution; verify acceptance criteria; then use the R2+ prompt. This document is the handoff — code in the tree may be a partial head start only.
