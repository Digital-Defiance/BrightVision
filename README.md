# BrightVision

**Website:** [brightvision.digitaldefiance.org](https://brightvision.digitaldefiance.org)

<div align="center">
  <img width="400" alt="BrightVision" title="BrightVision" src="https://brightvision.digitaldefiance.org/brightvision-white.svg" />
</div>

A **local-LLM-first** desktop IDE (Tauri + React) for AI-assisted coding — spec-driven tasks, superproject git, and a headless engine you control. **Two days of focused product work** (May 2026) shipped a full chat loop, tasks, git, editor, timing intelligence, and cecli agent hooks — not a thin wrapper.

**Built in partnership with the [Cecli](https://cecli.dev) team** — coding agent from [dwash96/cecli](https://github.com/dwash96/cecli) (coders, slash commands, agents, MCP, LiteLLM). BrightVision adds **`bright_vision_core`** HTTP/SSE so the React shell never drives the terminal CLI. Vision API: **`bright_vision_core/`** in this repo (PyPI `bright-vision-core`). Agent: submodule **`cecli/`** → [Digital-Defiance/cecli](https://github.com/Digital-Defiance/cecli).

<img width="1392" height="832" alt="BrightVision screenshot" src="https://github.com/user-attachments/assets/646e3140-72c5-4760-84ae-24b4b9015434" />
<img width="1392" height="832" alt="Screenshot 2026-05-26 at 8 50 56 PM" src="https://github.com/user-attachments/assets/09652221-d4bc-4dc3-8f25-56529d04b015" />
<img width="1728" height="1084" alt="Screenshot 2026-05-26 at 8 51 20 PM" src="https://github.com/user-attachments/assets/f9ea3523-aa0d-405c-aff8-371d59412c36" />
<img width="1728" height="1084" alt="Screenshot 2026-05-26 at 8 51 26 PM" src="https://github.com/user-attachments/assets/3e21ed90-362d-49f3-93dd-f0a16d786866" />
<img width="1728" height="1084" alt="Screenshot 2026-05-26 at 8 51 34 PM" src="https://github.com/user-attachments/assets/ead7a30a-b01b-48ff-be71-e15689eeeba7" />
<img width="1728" height="1084" alt="Screenshot 2026-05-26 at 8 59 38 PM" src="https://github.com/user-attachments/assets/21bfe84c-c134-43c6-82c6-71894133b42e" />
<img width="1728" height="1084" alt="Screenshot 2026-05-26 at 9 02 41 PM" src="https://github.com/user-attachments/assets/dc6a8e0c-302e-4d7a-b455-7e1c7b7f28a0" />


## What BrightVision does

| Pillar | Highlights |
|--------|------------|
| **Chat** | Streaming Thinking/Answer, Mermaid + highlighted fences, proposed edits, confirm/queue/stop, clear history + `/clear`, suggested-files tray, model router, empty-LLM retry |
| **Engine** | **[Cecli](https://cecli.dev)** under the hood; Vision HTTP API only — React never shells into the cecli TUI; SSE events drive the UI |
| **Tasks** | EARS/spec workflow v1–v5 — todos, layered specs, generate/refine, Implement steps |
| **Git** | Status, diffs, graph, stage/commit/undo (desktop) |
| **Editor** | CM6 tabs, explorer, open-from-chat |
| **Local LLM** | Ollama panel, hopper preload, ping, resource overlay (CPU/RAM/GPU) |
| **Agents** | `/agent`, `/invoke-agent`, `/spawn-agent`, `/reap-agent` + sub-agent registry in chat & Settings |
| **Timing** | Live Response/Think bar, per-model ETA, Settings history (TPS, avg/peak resources, CSV) |

Full catalog: **[docs/FEATURES.md](docs/FEATURES.md)** · backlog: **[docs/ROADMAP.md](docs/ROADMAP.md)**

## Quick start

### macOS (Homebrew)

```bash
brew tap digital-defiance/tap
brew install brightvision
```

### From source

```bash
git clone https://github.com/Digital-Defiance/BrightVision.git
cd BrightVision
git submodule update --init --recursive
yarn install
source activate.sh
yarn tauri dev
```

1. Install [Ollama](https://ollama.com/) and copy `local-llm.env.example` → `local-llm.env` ([docs/LOCAL_LLM.md](docs/LOCAL_LLM.md))  
2. **Terminal → Start** (launches core on `:8741`)  
3. **Chat** when the session is live  

## Tech stack

- **Shell**: Tauri v2 (Rust) + React 18 + TypeScript + Vite + MUI v6  
- **Engine**: **[Cecli](https://cecli.dev)** (submodule `cecli/`) + Vision HTTP `bright_vision_core/` (this repo; `pip install -e .`)  
- **Tests**: `yarn test:fast` · `yarn test:local` · [TESTING.md](docs/TESTING.md)  

## Configuration

**Settings** — model, workspace, fonts, timing stats, suggested files, model hopper, agents (`subagent_paths` in cecli config).

**Agents (cecli)** — define sub-agents as `*.md` under paths in `.cecli.conf.yml`; use chat **Agents** chips or `/invoke-agent reviewer …`. See Settings → Agents & sub-agents.

## Documentation

| Doc | Topic |
|-----|--------|
| [FEATURES.md](docs/FEATURES.md) | Product feature catalog |
| [ROADMAP.md](docs/ROADMAP.md) | Status & fix order |
| [UPSTREAM_CECLI.md](docs/UPSTREAM_CECLI.md) | Cecli submodule + Vision API layout |
| [ENGINE_TRANSITION.md](docs/ENGINE_TRANSITION.md) | Integration checklist (PyPI, CI) |
| [CECLI_MIGRATION_ROADMAP.md](docs/CECLI_MIGRATION_ROADMAP.md) | Engine port to cecli |
| [LOCAL_LLM.md](docs/LOCAL_LLM.md) | Ollama & local panel |
| [SPEC_DRIVEN_DEV.md](docs/SPEC_DRIVEN_DEV.md) | Tasks workflow |
| [IPC.md](docs/IPC.md) | HTTP API & SSE |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Dev setup |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Stuck sessions, `:8741` |
| [TESTING.md](docs/TESTING.md) | Test matrix |

## License

MIT — see `LICENSE`. Copyright (c) 2026 Digital Defiance, Jessica Mulein

## Contributing

Read **ROADMAP.md** before substantive work. Open issues with repro steps (workspace path, expected vs actual).
