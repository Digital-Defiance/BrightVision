# Aider Vision

**Website:** [aider-vision.digitaldefiance.org](https://aider-vision.digitaldefiance.org)

<img width="231" height="87" alt="Aider Vision" title="Aider Vision" src="https://aider-vision.digitaldefiance.org/aider-vision-black.svg" />

A lightweight, cross-platform desktop application built with **Tauri** and **React** that provides a graphical interface to manage, configure, and interact with the [Aider Vision Core](https://github.com/Digital-Defiance/aider-vision-core) AI coding assistant which is a headless version of [Aider](https://github.com/paul-gauthier/aider) with some improvements.

<img width="1392" height="832" alt="Screenshot 2026-05-24 at 10 04 45 PM" src="https://github.com/user-attachments/assets/739112bb-4c9b-4ddc-8d6d-ecebd6d9cb5b" />


## 🚀 Features

- **Vision API**: All prompting goes through the HTTP API (React is the head; core is headless under `aider-vision-core/`).
- **Chat UX**: Streaming replies with Thinking/Answer sections, proposed-edit accordions, confirm flow, queue/stop, `/add` path completion (desktop), image/PDF attach, Glass TTY–style chat font (configurable).
- **Tasks & specs**: Spec-driven workflow (`.aider-vision/todos.json`, generate/refine spec, steered **Implement** steps) — see [docs/SPEC_DRIVEN_DEV.md](docs/SPEC_DRIVEN_DEV.md).
- **Git tab**: Working tree, diffs, commit graph, stage/undo, auto-stage after turns (desktop).
- **Process management**: Reliable core start/stop, activity-bar progress for repo scan, Technical terminal for engine output.
- **Superproject + submodule**: Hack on Aider Vision itself with `aider-vision-core` as a submodule ([SUBMODULE_VERIFICATION.md](docs/SUBMODULE_VERIFICATION.md)).
- **Native performance**: Rust + Tauri v2 on macOS, Linux, and Windows.

## 🗺 Roadmap status

Living backlog: **[docs/ROADMAP.md](docs/ROADMAP.md)** (also on the [project site](https://aider-vision.digitaldefiance.org/#roadmap)). Summary as of the current tree:

| Status | Meaning |
|--------|---------|
| **Done** | Shipped in the app and/or `aider-vision-core` |
| **Partial** | Works in part; gaps documented in the roadmap |
| **Open** | Not started or in progress |
| **Longer-term** | Strategic; design before build |

**Current focus:** [dogfooding](docs/ROADMAP.md#current-focus--dogfooding) — daily use on real repos (`yarn tauri dev`), especially the superproject root, not expanding CI/e2e alone. Quick checks: `yarn test:local`; before larger changes: `yarn test:full`.

### Shipped (high level)

| Area | Highlights |
|------|------------|
| **Chat & session** | Stream dedupe, optimistic send + timeline tool order, multiline input, queue, stop, token stats, dismiss bubbles |
| **Engine** | Core API lifecycle, confirm API, optional manual commit, terminate `:8741` on quit |
| **Spec-driven (#18)** | Tasks tab v1–v5: workspace todos, three-layer specs, generate-spec jobs, Implement steps |
| **Charter §3 Git** | Git visualization tab (#27) |
| **Charter §23–24** | Process integration + LLM chat interface |

### In progress & next

| # | Status | Item |
|---|--------|------|
| **19** | Partial | Submodule/multi-repo — automated verify green; manual A–D dogfood sign-off pending |
| **26** | Partial | File awareness via git poll (8s); native FS watcher still open |
| **28** | Partial | Context: images, `/add`, folder attach; file-tree picker open |
| **30** | Partial | Web dev via Vite proxy; full desktop parity for `/add` Tab + generate-spec |
| **31** | Open | Release hygiene (tag core, bump submodule) — when sharing builds |
| **20–22** | Open | Kiro-depth spec UX (dedicated spec agent, EARS linter, repo-wide spec index) |
| **29** | Longer-term | Plugin / extension system |

**Suggested order while dogfooding:** submodule verification → friction from real use → context picker if needed → release tagging → spec-depth features. Details in [ROADMAP.md § Suggested fix order](docs/ROADMAP.md#suggested-fix-order).

## 🛠 Tech Stack

- **Backend**: Rust + Tauri v2
- **Frontend**: React + TypeScript + Vite
- **Styling**: MUI v6 + Emotion (`src/theme.ts`); global SCSS in `src/styles/`
- **Package Manager**: Yarn (Plug'n'Play)

## Note:

The plan is to let Aider Vision develop itself. I am using Qwen Coder 3.6 27b q4_K_M on an Apple Mac Pro M4 Max with 64GB RAM with 16 cores (12 Performance and 4 Efficiency).

## 📦 Getting Started

### macOS (Homebrew)

The fastest way to install on macOS is via our Homebrew tap. The cask ships a **signed and notarized** universal DMG — Gatekeeper-ready, no security warnings.

```bash
brew tap digital-defiance/tap
brew install aider-vision
```

This installs `Aider Vision.app` to `/Applications/`.

Tap repository: [digital-defiance/homebrew-tap](https://github.com/digital-defiance/homebrew-tap)

### From source

#### Prerequisites

- Node.js (v18+)
- Rust (latest stable)
- Yarn (v3+)
- Aider CLI installed and accessible in your PATH

#### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/digitaldefiance/aider-vision.git
   cd aider-vision
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Start the development server:
   ```bash
   yarn tauri dev
   ```

4. Build for production:
   ```bash
   yarn tauri build
   ```

## ⚙️ Configuration

**Settings → Model & system:** LLM model, LiteLLM extra params (JSON), project workspace, context files, auto-approve limit, prompt-before-commit, auto-stage on done, engine path (desktop).

**Settings → Appearance:** UI font, chat font (default [Glass TTY VT220](src/assets/fonts/Glass_TTY_VT220.woff2)), terminal font.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and [docs/USER_WORKFLOW.md](docs/USER_WORKFLOW.md) for defaults and day-to-day use.

## 📚 Documentation

| Doc | Topic |
|-----|--------|
| [ROADMAP.md](docs/ROADMAP.md) | Status, dogfooding focus, fix order |
| [TESTING.md](docs/TESTING.md) | Local-first tests (`yarn test:local` / `test:full`) |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup and conventions |
| [IPC.md](docs/IPC.md) | HTTP API and SSE events |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Connecting, orphaned `:8741`, common failures |
| [SUBMODULE_VERIFICATION.md](docs/SUBMODULE_VERIFICATION.md) | Superproject + `aider-vision-core` |
| [SPEC_DRIVEN_DEV.md](docs/SPEC_DRIVEN_DEV.md) | Tasks / spec-driven workflow |
| [RELEASE.md](docs/RELEASE.md) | Tag core and bump submodule |

## 📜 License

This project is licensed under the MIT License. See the `LICENSE` file for details.

Copyright (c) 2026 Digital Defiance, Jessica Mulein

## 🤝 Contributing

Contributions are welcome! Check **[docs/ROADMAP.md](docs/ROADMAP.md)** before substantive work; update roadmap statuses in the same PR when you ship or learn something new. Open an issue for dogfooding friction with repro (workspace path, file path, expected vs actual commit repo).
