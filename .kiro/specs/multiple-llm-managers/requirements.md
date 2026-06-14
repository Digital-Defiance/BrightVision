# Requirements Document

## Introduction

This feature decouples BrightVision's model lifecycle management (pulling, preloading, keep-alive, VRAM monitoring) from Ollama as the sole local runtime. LiteLLM already abstracts the inference API layer; this spec adds a backend selection mechanism, a unified lifecycle protocol, and UI/IPC adaptation so the app works cleanly with Ollama, vLLM, llama.cpp, TGI, or MLX-LM.

Scope: configuration resolution, Python protocol + registry, Rust Tauri IPC dispatcher, TypeScript types/hooks, and conditional UI rendering. The core inference routing (LiteLLM completion calls) is NOT modified — only provider prefix construction is extended.

## Requirements

### REQ-001: Backend Selection Configuration

**User Story:** As a power user, I want to select my local LLM runtime via an environment variable or persisted config so I can switch backends without editing source code.

1. **WHEN** the application initializes, **THE** system **SHALL** resolve the active backend from `BRIGHTVISION_LLM_BACKEND` environment variable, falling back to persisted config at `~/.config/brightvision/config.json`, then defaulting to `ollama`.
2. **IF** the resolved backend value is not in `{ollama, llamacpp, vllm, tgi, mlx-lm}` **THEN THE** system **SHALL** log a warning and default to `ollama`.
3. **WHEN** the backend selection changes **THE** system **SHALL** persist it to `~/.config/brightvision/config.json`.
4. **IF** the selected backend is unsupported on the current OS (e.g. `mlx-lm` on Linux/Windows) **THEN THE** system **SHALL** display an error notification and revert to a supported default.

### REQ-002: Abstracted Model Lifecycle Protocol

**User Story:** As a Python developer, I want a unified protocol for model lifecycle operations so `model_router.py` can orchestrate preloading and VRAM budgeting without Ollama-specific calls.

1. **WHEN** the router requires VRAM budgeting or preloading **THE** system **SHALL** call `BackendClient.preload_models()` and `BackendClient.get_vram_usage()` on the active backend instance.
2. **IF** the active backend does not expose VRAM or context metadata **THEN THE** system **SHALL** return `None` and log a debug message indicating fallback to static config.
3. **WHEN** the backend is `llamacpp` or `vllm` **THE** system **SHALL** implement `preload_models()` as a no-op returning an empty list.
4. **IF** a lifecycle operation fails (network timeout, backend down) **THEN THE** system **SHALL** catch the exception, log `ERROR` with the backend name, and degrade to static VRAM estimates without crashing.

### REQ-003: Tauri IPC Dispatcher

**User Story:** As a Rust developer, I want Tauri commands to route model management through a backend-aware dispatcher so unsupported operations return structured errors instead of Ollama HTTP 404s.

1. **WHEN** a frontend IPC request arrives for `fetch_tags_models` **THE** system **SHALL** route to the active backend, returning `[]` if listing is unsupported.
2. **IF** the user requests `pull_model` while backend is not `ollama` **THEN THE** system **SHALL** respond with `{ code: "UNSUPPORTED_OPERATION", message: "Model pulling is only supported for Ollama backends." }`.
3. **WHEN** the backend is `ollama` **THE** system **SHALL** execute existing `OllamaClient` methods unchanged (backward compatible).
4. **IF** the Tauri command receives malformed or missing backend config at init **THEN THE** system **SHALL** panic with a descriptive message and exit the desktop process.

### REQ-004: Frontend UI Adaptation

**User Story:** As a desktop user, I want model management controls to dynamically reflect my backend's capabilities so I only see features my runtime supports.

1. **WHEN** backend is `ollama` **THE** system **SHALL** render the full panel: VRAM sliders, preload lists, pull button.
2. **IF** backend is `vllm` or `llamacpp` **THEN THE** system **SHALL** disable VRAM sliders (label "managed externally") and hide the pull button.
3. **WHEN** the user switches backends in settings **THE** system **SHALL** invalidate cached model lists and VRAM data, forcing refresh on next mount.
4. **IF** the IPC call to resolve backend state times out after 2 seconds **THEN THE** system **SHALL** show a "Backend unavailable" banner and disable LLM controls until restored.

### REQ-005: Fallback Model Metadata

**User Story:** As a user running vLLM or llama.cpp, I want the app to estimate context limits and VRAM usage from a static registry so agent routing still makes informed escalation decisions.

1. **WHEN** the backend returns no dynamic metadata **THE** system **SHALL** resolve from a bundled JSON registry mapping model names to `{ max_context, estimated_vram_mb }`.
2. **IF** a model is not in the registry and the backend returns no metadata **THEN THE** system **SHALL** apply defaults: 8192 context tokens, 4096 MB VRAM, and log `WARN`.
3. **WHEN** the user sets a manual VRAM override **THE** system **SHALL** prioritize it over registry defaults.

### REQ-006: LiteLLM Routing Compatibility

**User Story:** As an engineer routing agent turns, I want LiteLLM prefix resolution to work across all backends so session continuity is maintained regardless of runtime.

1. **WHEN** routing to a local model **THE** system **SHALL** construct the LiteLLM prefix from backend config: `ollama`→`ollama_chat/`, `vllm`/`tgi`→`openai/`, `llamacpp`→`openai/`.
2. **IF** LiteLLM fails to connect to the backend URL **THEN THE** system **SHALL** trigger a session stall and offer "Switch Backend" in the UI.
3. **WHEN** falling back to cloud providers **THE** system **SHALL** preserve the original tier configuration (fast/code/think) across the switch.
4. **IF** a non-Ollama backend requires auth headers **THEN THE** system **SHALL** inject them via `LITELLM_EXTRA_PARAMS` without modifying the session generation loop.


## Glossary

| Term | Definition |
|------|-----------|
| Backend | A local LLM inference runtime (Ollama, vLLM, llama.cpp, TGI, MLX-LM) |
| LiteLLM | Python library abstracting LLM provider APIs into a unified completion interface |
| Provider prefix | String prepended to model names for LiteLLM routing (e.g. `ollama_chat/`, `openai/`) |
| VRAM | Video RAM on GPU; used for model memory budgeting |
| Lifecycle operation | Pull, preload, keep-alive, or VRAM query — distinct from inference/completion calls |
| BackendClient | Python Protocol defining the lifecycle abstraction each backend implements |
