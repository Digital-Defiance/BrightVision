# Aider Vision

**Website:** [aider-vision.digitaldefiance.org](https://aider-vision.digitaldefiance.org)

<img width="231" height="87" alt="Aider Vision" title="Aider Vision" src="https://aider-vision.digitaldefiance.org/aider-vision-black.svg" />

A lightweight, cross-platform desktop application built with **Tauri** and **React** that provides a graphical interface to manage, configure, and interact with the [Aider Vision Core](https://github.com/Digital-Defiance/aider-vision-core) AI coding assistant which is a headless version of [Aider](https://github.com/paul-gauthier/aider) with some improvements.

<img width="1277" height="716" alt="Screenshot 2026-05-24 at 11 53 11 AM" src="https://github.com/user-attachments/assets/40053e79-dae2-4fda-ad29-79e9115b22af" />

## 🚀 Features

- **Vision API**: All prompting goes through the HTTP API (React is the head; core is headless under `aider-vision-core/`).
- **Process Management**: Desktop spawns local `aider-vision-core-serve`; web uses the same API via Vite proxy or direct URL.
- **Real-time Interaction**: Send prompts and view responses in a dedicated Chat tab, alongside a Technical Terminal for debugging.
- **Customizable Configuration**: Easily adjust the binary path, LLM model, extra CLI parameters, working directory, and auto-approve limits.
- **Core Repository Integration**: Seamlessly link to an `aider-vision-core` submodule or directory for advanced JSONL worker support.
- **Native Performance**: Built with Rust and Tauri v2 for a fast, low-footprint experience on Windows, macOS, and Linux.

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

The application exposes the following configuration options in the **Settings** tab:

| Option             | Description                                                                 | Default                  |
|--------------------|-----------------------------------------------------------------------------|--------------------------|
| `binaryPath`       | Path to the `aider` executable or script.                                   | `aider-vision-core`      |
| `model`            | The LLM model to use (e.g., `gpt-4`, `claude-3`, `ollama/codellama`).       | `ollama_chat/qwen3.6...` |
| `extraParams`      | JSON string of additional parameters passed as `LITELLM_EXTRA_PARAMS`.      | `{"think": false}`       |
| `workingDir`       | The directory where Aider will operate and manage files.                    | `.`                      |
| `autoApproveLimit` | Threshold for automatic approval of file changes (set to `>0` to enable).   | `0`                      |
| `workerMode`       | Execution mode: `auto`, `jsonl`, or `cli`.                                  | `auto`                   |
| `coreRepoPath`     | Relative path to `aider-vision-core` for JSONL worker script resolution.    | `aider-vision-core`      |
| `pythonPath`       | Path to the Python interpreter for the JSONL worker.                        | *(empty)*                |

## 📜 License

This project is licensed under the MIT License. See the `LICENSE` file for details.

Copyright (c) 2026 Digital Defiance, Jessica Mulein

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue for bug reports and feature requests.
