### Introduction
This feature introduces multi-backend support for local large language model (LLM) inference, decoupling the application from Ollama as the sole runtime. While LiteLLM already abstracts the API layer for routing and completion calls, the desktop client currently ties model lifecycle management (pulling, preloading, keep-alive, VRAM monitoring) directly to Ollama's HTTP protocol. This feature defines an abstracted backend protocol, introduces a configuration-driven selection mechanism, and adapts the Tauri IPC layer and frontend UI to gracefully handle backends that lack equivalent lifecycle APIs (e.g., llama.cpp server, vLLM, text-generation-inference). The scope covers configuration resolution, Python/TypeScript abstraction layers, Rust Tauri commands, and UI adaptation; it does not modify the core inference routing logic, which remains handled by LiteLLM.

### REQ-001: Backend Selection Configuration
**User Story:** As a power user or developer, I want to configure the local LLM runtime via an environment variable or settings file, so that I can switch between Ollama and alternative runtimes without modifying source code.

**Acceptance Criteria**
1. **WHEN** the application initializes **THE** system **SHALL** resolve the active backend from the `BRIGHTVISION_LLM_BACKEND` environment variable, falling back to `ollama` if unset or empty.
2. **IF** the resolved backend value is not in the set `{ollama, llamacpp, vllm, tgi, mlx-lm}` **THEN THE** system **SHALL** log a warning, reject the invalid value, and default to `ollama`.
3. **WHEN** the backend configuration changes **THE** system **SHALL** persist the selection in the application's local config store (`~/.config/brightvision/config.json` or equivalent) so that the setting survives restarts.
4. **IF** the user attempts to start a session with an unsupported backend for their current OS (e.g., `mlx-lm` on Windows) **THEN THE** system **SHALL** display an error notification explaining the platform limitation and revert to a supported default.

### REQ-002: Abstracted Model Lifecycle Protocol
**User Story:** As a Python developer maintaining the routing layer, I want a unified protocol for model lifecycle operations, so that `bright_vision_core/model_router.py` can orchestrate preloading and keep-alive without hardcoding Ollama-specific calls.

**Acceptance Criteria**
1. **WHEN** `model_router.py` requires VRAM budgeting or priority preloading **THE** system **SHALL** invoke the abstracted `BackendClient.preload_models()` and `BackendClient.get_vram_usage()` methods rather than calling Ollama HTTP endpoints directly.
2. **IF** the active backend does not expose VRAM or context window metadata **THEN THE** system **SHALL** return `None` from the metadata query and log a debug message indicating the fallback to static configuration.
3. **WHEN** the active backend is set to `llamacpp` or `vllm` **THE** system **SHALL** implement `preload_models()` as a no-op that immediately returns an empty success list, since these runtimes load models on server startup.
4. **IF** a lifecycle operation fails due to network timeout or backend unavailability **THEN THE** system **SHALL** catch the exception, log it at the `ERROR` level with the backend name, and gracefully degrade to static VRAM estimates without crashing the session.

### REQ-003: Tauri IPC Abstraction for Model Management
**User Story:** As a Rust developer maintaining the desktop client, I want the Tauri commands in `local_llm_runtime.rs` to route model management requests through a backend-aware dispatcher, so that unsupported operations return clear errors instead of failing silently or throwing Ollama-specific HTTP 404s.

**Acceptance Criteria**
1. **WHEN** a frontend IPC request arrives for model listing (`fetch_tags_models`) **THE** system **SHALL** route the call to the active backend's client implementation, returning an empty array if the backend does not support dynamic listing.
2. **IF** the user requests a model pull operation while the backend is `vllm` or `llamacpp` **THEN THE** system **SHALL** respond with a structured error payload `{ code: "UNSUPPORTED_OPERATION", message: "Model pulling is only supported for Ollama backends." }`.
3. **WHEN** the active backend is `ollama` **THE** system **SHALL** execute the existing `OllamaClient` methods (`preload_generate`, `touch_keep_alive`, `ping_generate`) unchanged to preserve backward compatibility.
4. **IF** the Tauri command receives a malformed or missing backend configuration during initialization **THEN THE** system **SHALL** panic with a descriptive message and exit the desktop process, preventing undefined routing behavior in the Rust layer.

### REQ-004: Frontend UI Adaptation for Backend-Specific Controls
**User Story:** As a desktop user interacting with the settings panel, I want the model management controls (VRAM sliders, preload toggles, pull buttons) to dynamically enable or disable based on the selected backend, so that I only see and interact with features available to my runtime.

**Acceptance Criteria**
1. **WHEN** the active backend is `ollama` **THE** system **SHALL** render the full model management panel including VRAM budget sliders, preload priority lists, and a "Pull Model" interface.
2. **IF** the active backend is `vllm` or `llamacpp` **THEN THE** system **SHALL** disable VRAM budget sliders and mark them as "managed externally", while hiding the "Pull Model" button entirely.
3. **WHEN** the user switches the backend in settings **THE** system **SHALL** immediately invalidate cached model lists and VRAM data, forcing a refresh on the next panel mount.
4. **IF** the frontend IPC call to resolve the active backend times out after 2 seconds **THEN THE** system **SHALL** display a "Backend unavailable" banner and disable all LLM-related controls until connectivity is restored.

### REQ-005: Fallback Model Metadata Resolution
**User Story:** As a user running vLLM or llama.cpp, I want the application to still estimate context limits and VRAM usage accurately, so that the agent routing logic can make informed decisions about model escalation without backend API support.

**Acceptance Criteria**
1. **WHEN** the active backend does not provide dynamic VRAM or context window data **THEN THE** system **SHALL** resolve static metadata from `BRIGHTVISION_MODEL_METADATA` environment variables or a bundled JSON registry mapping model names to `{ max_context, estimated_vram_mb }`.
2. **IF** a requested model is not found in the static registry and the backend returns no metadata **THEN THE** system **SHALL** apply a conservative default of 8192 context tokens and 4096 MB VRAM, logging a `WARN` to indicate the estimation is heuristic.
3. **WHEN** the user manually overrides VRAM limits in settings **THE** system **SHALL** merge the override with static backend metadata, prioritizing the explicit user value over registry defaults.

### REQ-006: LiteLLM Routing Compatibility
**User Story:** As an engineer routing agent turns to different models, I want the LiteLLM prefix resolution and tier-based escalation logic to work seamlessly across all configured backends, so that session continuity is maintained regardless of the local runtime.

**Acceptance Criteria**
1. **WHEN** a turn requires routing to a local model **THE** system **SHALL** construct the LiteLLM provider prefix (`openai/` for vllm/tgi, `ollama_chat/` for ollama, `llama.cpp/` if registered) based on the active backend configuration.
2. **IF** the LiteLLM client fails to connect to the configured backend base URL **THEN THE** system **SHALL** capture the connection error, route it as a session stall, and offer the user a "Switch Backend" prompt in the UI.
3. **WHEN** the application falls back to cloud providers during local backend downtime **THE** system **SHALL** preserve the original model routing tier configuration so that escalation rules remain consistent across runtime switches.
4. **IF** a non-Ollama backend requires custom headers or authentication tokens (e.g., API keys for vLLM Cloud) **THEN THE** system **SHALL** inject them via `LITELLM_EXTRA_PARAMS` without modifying the core session generation loop.