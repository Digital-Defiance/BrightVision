- [ ] 1. ... _Requirements: ..._ (depends: none)
  - [ ] 1.1 ...
- [ ] 2. ... _Requirements: ..._ (depends: 1)
...
All good.
Proceeds. 
Output Generation. 
[Output Generation] -> *Proceeds*

------------
► **ANSWER**


- [ ] 1. Create backend config resolver in Python (`bright_vision_core/config.py`) — _Requirements: REQ-001_ (depends: none)
  - [ ] 1.1 Implement `resolve_backend_config()` to read `BRIGHTVISION_LLM_BACKEND`, fall back to persisted config, then default to `ollama`. Validate against allowed set `{ollama, llamacpp, vllm, tgi, mlx-lm}`. (REQ-001)
  - [ ] 1.2 Add platform compatibility check (`platform_supported`) and persist selection to `~/.config/brightvision/config.json`. (REQ-001)
  - [ ] 1.3 Write unit tests validating env var precedence, config persistence, invalid backend rejection, and OS incompatibility handling. (REQ-001)

- [ ] 2. Create bundled metadata registry and static resolver — _Requirements: REQ-005_ (depends: 1)
  - [ ] 2.1 Add `bright_vision_core/llm_backends/metadata.json` mapping model names to `{ max_context, estimated_vram_mb }`. (REQ-005)
  - [ ] 2.2 Implement `resolve_static_metadata(model_name)` in Python: merge user VRAM overrides > registry lookup > conservative defaults (8192 ctx, 4096 MB) with `WARN` logging. (REQ-005)
  - [ ] 2.3 Write unit tests for registry lookup, override merging, and default fallback logic. (REQ-005)

- [ ] 3. Define abstract backend protocol — _Requirements: REQ-002_ (depends: none)
  - [ ] 3.1 Create `bright_vision_core/llm_backends/base.py` with `BackendClient(Protocol)` defining `preload_models`, `get_vram_usage`, `get_context_window`, `list_available_models`. (REQ-002)
  - [ ] 3.2 Implement `OllamaClient`, `VLLMClient`, and `LlamaCppClient` classes implementing the protocol. Ensure vLLM/llama.cpp return no-ops/empty lists for VRAM/pull operations. (REQ-002)
  - [ ] 3.3 Write unit tests mocking each backend to verify protocol compliance, graceful degradation on network timeouts, and correct return types. (REQ-002)

- [ ] 4. Implement `BackendRegistry` — _Requirements: REQ-002_ (depends: 3)
  - [ ] 4.1 Create `bright_vision_core/llm_backends/registry.py` with `BackendRegistry.get_active()` and `register()` methods to manage active backend instance. (REQ-002)
  - [ ] 4.2 Wire registry initialization to the config resolver from step 1. (REQ-002)
  - [ ] 4.3 Write integration tests verifying registry loads correct backend at startup and routes method calls correctly. (REQ-002)

- [ ] 5. Update Tauri config resolver — _Requirements: REQ-001, REQ-003_ (depends: 1)
  - [ ] 5.1 Extend `src-tauri/src/local_llm_config.rs` to resolve `BRIGHTVISION_LLM_BACKEND` and validate OS compatibility at startup. Panic on malformed/missing config per spec. (REQ-001, REQ-003)
  - [ ] 5.2 Write Rust unit tests for config resolution, platform checks, and panic behavior on invalid input. (REQ-001, REQ-003)

- [ ] 6. Create Tauri IPC dispatcher — _Requirements: REQ-003_ (depends: 5)
  - [ ] 6.1 Add `LlmBackendDispatcher` struct in `src-tauri/src/local_llm_runtime.rs` to route lifecycle commands (`fetch_tags_models`, `pull_model`, `preload_generate`, etc.). (REQ-003)
  - [ ] 6.2 Implement structured error responses `{ code: "UNSUPPORTED_OPERATION", message: "..." }` for unsupported operations like pulling on vLLM. (REQ-003)
  - [ ] 6.3 Ensure `ollama` backend routes unchanged to existing `OllamaClient` methods for backward compatibility. (REQ-003)
  - [ ] 6.4 Write Rust tests mocking IPC commands, verifying routing logic and structured error payloads. (REQ-003)

- [ ] 7. Extend `ModelRouterConfig` — _Requirements: REQ-006_ (depends: 1)
  - [ ] 7.1 Add `backend` and `provider_prefix` fields to `ModelRouterConfig` in `bright_vision_core/model_router.py`. (REQ-006)
  - [ ] 7.2 Implement prefix mapping logic: `ollama` → `ollama_chat/`, `vllm`/`tgi` → `openai/`, `llamacpp` → `llama_cpp/`. (REQ-006)
  - [ ] 7.3 Write unit tests asserting correct provider prefix resolution and tier configuration preservation across runtime switches. (REQ-006)

- [ ] 8. Implement auth/header injection — _Requirements: REQ-006_ (depends: 7)
  - [ ] 8.1 Update session generation loop to inject backend-specific headers via `LITELLM_EXTRA_PARAMS` without modifying core routing logic. (REQ-006)
  - [ ] 8.2 Write unit tests verifying header injection only applies when required and doesn't leak credentials. (REQ-006)

- [ ] 9. Update TypeScript types & hooks — _Requirements: REQ-004_ (depends: none)
  - [ ] 9.1 Extend `LocalLlmSnapshot` in `src/ipc/localLlm.ts` with `backend` and `capabilities: BackendCapabilities`. (REQ-004)
  - [ ] 9.2 Create `useBackendCapabilities()` hook to read snapshot and drive conditional rendering logic. (REQ-004)
  - [ ] 9.3 Write unit tests for the hook verifying correct capability flags based on backend type. (REQ-004)

- [ ] 10. Adapt UI components — _Requirements: REQ-004_ (depends: 9)
  - [ ] 10.1 Modify `LocalLlmPanel.tsx` to render full controls for Ollama, disable VRAM sliders + hide pull button for vLLM/llama.cpp, and mark sliders as "managed externally". (REQ-004)
  - [ ] 10.2 Implement IPC timeout handling (>2s) to display "Backend unavailable" banner and disable LLM controls until connectivity restored. (REQ-004)
  - [ ] 10.3 Add cache invalidation logic on backend switch to force model list/VRAM refresh on next mount. (REQ-004)
  - [ ] 10.4 Write Playwright/E2E tests asserting conditional rendering, timeout banner behavior, and cache invalidation on backend change. (REQ-004)