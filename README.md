# BrightVision

**Website:** [bright-vision.digitaldefiance.org](https://bright-vision.digitaldefiance.org)

<div align="center">
  <img width="400" alt="BrightVision" title="BrightVision" src="https://bright-vision.digitaldefiance.org/bright-vision-white.svg" />
</div>

A lightweight, cross-platform desktop IDE built with **Tauri** and **React** — **local LLM first**, spec-driven tasks, and superproject/submodule git — powered by **[BrightVision Core](https://github.com/Digital-Defiance/bright-vision-core)** (a **fork²** on [cecli](https://github.com/dwash96/cecli): bundled cecli + ported headless HTTP API from our earlier `aider-vision-core` — see [lineage](https://github.com/Digital-Defiance/bright-vision-core/blob/main/docs/LINEAGE.md)).

<img width="1392" height="832" alt="Screenshot 2026-05-25 at 1 46 13 PM" src="https://github.com/user-attachments/assets/646e3140-72c5-4760-84ae-24b4b9015434" />

## 🚀 Features

- **Vision API**: All prompting goes through the HTTP API (React is the head; core is headless under `bright-vision-core/`).
- **Local LLM**: Ollama + built-in Local LLM panel; defaults to on-device models — see [docs/LOCAL_LLM.md](docs/LOCAL_LLM.md).
- **Chat UX**: Streaming replies, Thinking/Answer sections, proposed-edit accordions, confirm flow, queue/stop, `/add` path completion (desktop), image/PDF attach.
- **Tasks & specs**: EARS/spec-driven workflow (`.bright-vision/todos.json`, generate/refine spec, steered **Implement** steps) — [docs/SPEC_DRIVEN_DEV.md](docs/SPEC_DRIVEN_DEV.md).
- **Git tab**: Working tree, diffs, commit graph, stage/undo, auto-stage after turns (desktop).
- **Superproject + submodules**: Multi-repo workspace via `RepoSet` — [docs/SUBMODULE_VERIFICATION.md](docs/SUBMODULE_VERIFICATION.md).
- **Native performance**: Rust + Tauri v2 on macOS, Linux, and Windows.

## 🗺 Roadmap status

Living backlog: **[docs/ROADMAP.md](docs/ROADMAP.md)** · [project site](https://bright-vision.digitaldefiance.org/#roadmap).

**Current focus:** [cecli engine migration](docs/CECLI_MIGRATION_ROADMAP.md) (default engine `bright-vision-core`) then **dogfooding** on real repos (`yarn tauri dev`).

Quick checks: `yarn test:local` · core: `yarn test:bright-core`

## 🛠 Tech Stack

- **Backend**: Rust + Tauri v2
- **Frontend**: React + TypeScript + Vite
- **Engine**: Python — `bright_vision_core` (HTTP/SSE) on **cecli** (coders, agents, commands)
- **Styling**: MUI v6 + Emotion; global SCSS in `src/styles/`
- **Package Manager**: Yarn

## 🔒 Local LLM first (privacy-first)

BrightVision targets **local inference** on your hardware:

1. Install **[Ollama](https://ollama.com/)**.
2. Copy **`local-llm.env.example`** → **`local-llm.env`** (`DATA_MODEL`, optional `OLLAMA_HOST`) — **[docs/LOCAL_LLM.md](docs/LOCAL_LLM.md)**. Local LLM is built into the app (Rust + Python); no `local-llm.sh` required.
3. **Desktop:** **Terminal → Local LLM → Start**, or **Auto before session** + **Terminal → Start**.
4. Chat when the session is live.

Cloud providers still work via LiteLLM model strings and API keys in the environment.

## Note

Dogfooding target: BrightVision builds itself. Primary local setup: **Qwen Coder 3.6 27b q4_K_M** on Apple Silicon (64GB RAM).

## 📦 Getting Started

### macOS (Homebrew)

```bash
brew tap digital-defiance/tap
brew install bright-vision
```

Installs `BrightVision.app` to `/Applications/`. Tap: [digital-defiance/homebrew-tap](https://github.com/Digital-Defiance/homebrew-tap)

Legacy cask name `aider-vision` may still exist during transition.

### From source

#### Prerequisites

- Node.js (v18+)
- Rust (latest stable)
- Yarn (v3+)
- Python 3.10+ (for the engine submodule)

#### Installation

```bash
git clone https://github.com/Digital-Defiance/bright-vision.git
cd bright-vision
git submodule update --init --recursive
yarn install
source activate.sh    # editable bright-vision-core + uvicorn
yarn tauri dev
```

Production build: `yarn tauri build`

Legacy engine: `BRIGHT_VISION_ENGINE=bright-vision-core source activate.sh`

## ⚙️ Configuration

**Settings → Model & system:** LLM model (default `ollama_chat/qwen3.6:27b-q4_K_M`), LiteLLM extra params, project workspace, context files, engine path (`bright-vision-core`).

**Settings → Appearance:** UI / chat / terminal fonts (default chat: Glass TTY VT220).

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), [docs/USER_WORKFLOW.md](docs/USER_WORKFLOW.md), [docs/LOCAL_LLM.md](docs/LOCAL_LLM.md).

## 📚 Documentation

| Doc | Topic |
|-----|--------|
| [CECLI_MIGRATION_ROADMAP.md](docs/CECLI_MIGRATION_ROADMAP.md) | Engine port status (cecli + bright_vision_core) |
| [LOCAL_LLM.md](docs/LOCAL_LLM.md) | Ollama, Local LLM panel, `local-llm.env` |
| [ROADMAP.md](docs/ROADMAP.md) | Product backlog |
| [TESTING.md](docs/TESTING.md) | `yarn test:local` / `test:full` |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup and conventions |
| [IPC.md](docs/IPC.md) | HTTP API and SSE events |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Connecting, orphaned `:8741` |
| [SUBMODULE_VERIFICATION.md](docs/SUBMODULE_VERIFICATION.md) | Superproject + submodules |
| [SPEC_DRIVEN_DEV.md](docs/SPEC_DRIVEN_DEV.md) | Tasks / spec-driven workflow |
| [RELEASE.md](docs/RELEASE.md) | Tag core and bump submodule |

## 📜 License

MIT — see `LICENSE`.

Copyright (c) 2026 Digital Defiance, Jessica Mulein

## 🤝 Contributing

Read **[docs/ROADMAP.md](docs/ROADMAP.md)** and **[docs/CECLI_MIGRATION_ROADMAP.md](docs/CECLI_MIGRATION_ROADMAP.md)** before substantive work. Open issues with repro (workspace path, expected vs actual).
