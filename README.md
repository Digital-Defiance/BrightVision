# Aider Vision

A lightweight, cross-platform desktop application built with **Tauri** and **React** that provides a graphical interface to manage, configure, and interact with the [Aider](https://github.com/paul-gauthier/aider) AI coding assistant.

## 🚀 Features

- **Process Management**: Start, stop, and monitor the Aider CLI or JSONL worker process directly from the UI.
- **Flexible Worker Modes**: Automatically detect and switch between `jsonl` (Session API), `cli`, or `auto` fallback modes.
- **Real-time Interaction**: Send prompts and view responses in a dedicated Chat tab, alongside a Technical Terminal for debugging.
- **Customizable Configuration**: Easily adjust the binary path, LLM model, extra CLI parameters, working directory, and auto-approve limits.
- **Core Repository Integration**: Seamlessly link to an `aider-vision-core` submodule or directory for advanced JSONL worker support.
- **Native Performance**: Built with Rust and Tauri v2 for a fast, low-footprint experience on Windows, macOS, and Linux.

## 🛠 Tech Stack

- **Backend**: Rust + Tauri v2
- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Package Manager**: Yarn (Plug'n'Play)

## 📦 Getting Started

### Prerequisites

- Node.js (v18+)
- Rust (latest stable)
- Yarn (v3+)
- Aider CLI installed and accessible in your PATH

### Installation

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
