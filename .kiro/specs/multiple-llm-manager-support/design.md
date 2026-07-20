### Overview
### Architecture
### Components and Interfaces
### Data Models
### Error Handling
### Testing Strategy

All set. Output matches. 
Proceeds. 
[Output Generation] -> *Self-Correction/Verification during generation prep*: 
Check REQ-003.4: "IF the Tauri command receives a malformed or missing backend configuration during initialization THEN THE system SHALL panic with a descriptive message and exit the desktop process". I will explicitly note this in Tauri IPC Dispatcher.
Check REQ-004.4: 2s timeout -> banner. Noted in UI section.
Check REQ-005.1/2/3: Static registry, defaults (8192/4096), user override merge. Noted in Data Models & Python Core.
Check REQ-006.1: LiteLLM prefix mapping (`openai/vllm/`, `ollama_chat/`). Noted.
All good. Output matches request precisely. 
Proceeds. 
[Output Generation] -> *Output Generation* (matches the final response)
```markdown
...
```
Done. 
Proceeds. 
*(Self-Correction/Note during thought)*: I need to make sure I don't use markdown code blocks for the whole response, just standard markdown formatting as requested. The prompt says "Respond with markdown only, under a single level-2 heading:". I will follow that exactly.
I will draft it now. 
[Output Generation] -> *Proceeds*

------------
► **ANSWER**


### Overview
This design introduces a pluggable local LLM runtime abstraction layer that decouples BrightVision's model lifecycle management from Ollama while preserving LiteLLM's API-level routing and the core inference loop. The approach defines a unified `BackendClient` protocol in Python, a backend-aware dispatcher in Rust/Tauri, and capability-driven UI toggles in TypeScript. 

Key technical decisions:
- **Protocol-first abstraction**: Instead of scattering conditional logic across `model_router.py` and `local_llm_runtime.rs`, we define explicit interfaces (`preload_models`, `get_vram_usage`, `list_available_models`) that each backend implements. This satisfies REQ-002 and REQ-003 cleanly.
- **Static metadata fallback**: Since runtimes like vLLM and llama.cpp do not expose dynamic VRAM or context window APIs, we introduce a bundled JSON registry + environment variable override system. This satisfies REQ-005 without requiring backend-specific HTTP probing.
- **Configuration resolution hierarchy**: `BRIGHTVISION_LLM_BACKEND` env var → persisted config store (`~/.config/brightvision/config.json`) → `ollama` default. OS compatibility is checked at Tauri init time. Satisfies REQ-001 and REQ-003.4.
- **LiteLLM prefix mapping**: The routing layer maps backend names to LiteLLM provider prefixes (`openai/vllm/`, `ollama_chat/`, etc.) at session startup, keeping the inference loop untouched. Satisfies REQ-006.

### Architecture
```mermaid
graph TD
    UI[Frontend Settings / LocalLlmPanel] -->|IPC| Tauri[Tauri IPC Dispatcher<br/>src-tauri/src/local_llm_runtime.rs]
    Tauri -->|Config Resolve| Config[Backend Config Resolver<br/>local_llm_config.rs + config.json]
    Tauri -->|Dispatch Lifecycle| PyCore[Python Core Runtime]
    PyCore -->|Protocol Calls| Registry[BackendRegistry<br/>bright_vision_core/llm_backends/]
    Registry --> Ollama[OllamaClient]
    Registry --> VLLM[vLLMClient]
    Registry --> LLamacpp[llama.cpp Client]
    PyCore -->|LiteLLM Prefix Mapping| LiteLLM[LiteLLM Completion API]
    Config -->|Static Metadata+Env| MetaDB[MetadataRegistry<br/>bright_vision_core/llm_backends/metadata.json]
    UI <--|Snapshot + Capabilities-- Tauri
```

Data flow:
1. **Initialization**: Tauri reads `BRIGHTVISION_LLM_BACKEND` and config store. Validates platform support. Panics on malformed config (REQ-003.4).
2. **Configuration Sync**: Active backend is persisted to `config.json`. Frontend receives updated `LocalLlmSnapshot.backend` and `capabilities`.
3. **Lifecycle Operations**: UI triggers preload/pull/VRAM queries → Tauri dispatcher routes to active backend's Rust client or returns structured errors (REQ-003.2). Python core uses `BackendClient` protocol for VRAM/context budgeting (REQ-002).
4. **Routing & Inference**: `ModelRouterConfig.backend` is mapped to a LiteLLM provider prefix. Session generation uses `LITELLM_EXTRA_PARAMS` for auth/headers. Connection failures trigger session stall state with "Switch Backend" prompt (REQ-006).

### Components and Interfaces

#### 1. Configuration Resolver (`bright_vision_core/config.py` / `src-tauri/src/local_llm_config.rs`)
- Resolves active backend from env → config store → `ollama` fallback.
- Validates against allowed set `{ollama, llamacpp, vllm, tgi, mlx-lm}` (REQ-001.2).
- Checks OS compatibility at startup; returns structured error or panics if invalid for platform (REQ-001.4, REQ-003.4).
- Persists selection to `~/.config/brightvision/config.json` (REQ-001.3).

#### 2. Python Backend Protocol & Registry (`bright_vision_core/llm_backends/base.py`, `registry.py`)
```python
class BackendClient(Protocol):
    def preload_models(self, models: list[str]) -> list[str]: ...
    def get_vram_usage(self) -> int | None: ...
    def get_context_window(self, model: str) -> int | None: ...
    def list_available_models(self) -> list[str]: ...

class BackendRegistry:
    @classmethod
    def get_active(cls) -> BackendClient: ...
    @classmethod
    def register(cls, name: str, client: BackendClient) -> None: ...
```
- Satisfies REQ-002.1/2/4. `llamacpp`/`vllm` implementations return no-ops for VRAM/context and empty success lists for preload (REQ-002.3). All lifecycle calls wrapped in try/except, logging `ERROR` with backend name on timeout/unavailability (REQ-002.4).

#### 3. Tauri IPC Dispatcher (`src-tauri/src/local_llm_runtime.rs`)
- Extends existing `OllamaClient` routing logic into a `LlmBackendDispatcher`.
- Commands:
  - `fetch_tags_models()` → routes to active backend; returns `[]` if unsupported (REQ-003.1).
  - `pull_model(model: String)` → returns `{ code: "UNSUPPORTED_OPERATION", message: "..." }` for non-Ollama backends (REQ-003.2).
  - `preload_generate`, `touch_keep_alive`, `ping_generate` → unchanged when backend is `ollama` (REQ-003.3).
- Initialization validates config structure; panics with descriptive message if malformed/missing (REQ-003.4).

#### 4. LiteLLM Prefix Mapper (`bright_vision_core/model_router.py`)
- Extends `ModelRouterConfig` with `backend: str` and `provider_prefix: str`.
- Maps backends to LiteLLM prefixes: `ollama` → `ollama_chat/`, `vllm`/`tgi` → `openai/`, `llamacpp` → `llama_cpp/` (if registered).
- Injects auth/headers via `LITELLM_EXTRA_PARAMS` without modifying session generation loop (REQ-006.4).
- Preserves tier configuration (`fast_model`, `heavy_model`, etc.) across runtime switches (REQ-006.3).

#### 5. Frontend State & UI (`src/ipc/localLlm.ts`, `src/components/settings/LocalLlmPanel.tsx`)
- Extends `LocalLlmSnapshot` with `backend: string` and `capabilities: BackendCapabilities`.
- Hook `useBackendCapabilities()` reads snapshot and drives conditional rendering:
  - VRAM sliders disabled + marked "managed externally" for vLLM/llama.cpp (REQ-004.2).
  - "Pull Model" button hidden for non-Ollama backends (REQ-004.2).
  - Full panel rendered for Ollama (REQ-004.1).
- Backend switch invalidates cached model lists/VRAM data on next mount (REQ-004.3).
- IPC timeout > 2s triggers "Backend unavailable" banner and disables LLM controls until connectivity restored (REQ-004.4).

### Data Models

#### `BackendConfig` (Persisted JSON)
```json
{
  "active_backend": "ollama",
  "backend_url": "http://localhost:11434",
  "platform_supported": true,
  "user_vram_override_mb": null
}
```
- `active_backend` validated against allowed set. `platform_supported` checked at Tauri init.

#### `BackendCapabilities` (TypeScript / Python)
```typescript
interface BackendCapabilities {
  supports_vram_query: boolean;
  supports_model_pull: boolean;
  supports_context_window_query: boolean;
}
```
- Populated by backend registry based on runtime capabilities. Drives UI toggles (REQ-004).

#### `LocalLlmSnapshot` (Extended from `src/ipc/localLlm.ts`)
```typescript
export interface LocalLlmSnapshot {
  sources: string[];
  ollamaHost: string | null;
  dataModel: string | null;
  llmMode: string | null;
  backend: 'ollama' | 'vllm' | 'llamacpp' | 'tgi' | 'mlx-lm';
  capabilities: BackendCapabilities;
  static_metadata?: { max_context: number | null; estimated_vram_mb: number | null };
}
```

#### `MetadataRegistry` (Bundled JSON + Env Override)
- Path: `bright_vision_core/llm_backends/metadata.json`
- Structure: `{ "models": { "<model_name>": { "max_context": 128000, "estimated_vram_mb": 6144 }, ... } }`
- Resolution logic (REQ-005): 
  1. Check `user_vram_override_mb` in `BackendConfig` (highest priority).
  2. Fall back to registry lookup by model name.
  3. If missing, apply conservative defaults: `max_context = 8192`, `estimated_vram_mb = 4096`. Log `WARN` indicating heuristic estimation.

### Error Handling

| Failure Mode | Detection | Internal Response | User-Visible Response | REQ Ref |
|--------------|-----------|-------------------|------------------------|---------|
| Invalid backend name | Config resolver validates against allowed set | Logs warning, defaults to `ollama` | Toast notification: "Invalid backend, defaulting to ollama" | REQ-001.2 |
| OS incompatibility (e.g., mlx-lm on Windows) | Tauri init platform check | Returns structured error / panics per spec | Error banner explaining limitation + reverts to supported default | REQ-001.4, REQ-003.4 |
| Network timeout / backend unavailability | Python core wraps lifecycle calls in try/except; Tauri IPC timeout >2s | Catches exception, logs `ERROR` with backend name, falls back to static VRAM/context | "Backend unavailable" banner; LLM controls disabled until recovery | REQ-002.4, REQ-003.3, REQ-004.4 |
| Malformed/missing Tauri config | Rust init validation | Panics with descriptive message, exits desktop process | Desktop crash dialog (intentional per spec to prevent undefined routing) | REQ-003.4 |
| LiteLLM connection failure | Routing loop catches HTTP/connection errors | Captures error, triggers session stall state, preserves tier config | Session stall overlay + "Switch Backend" prompt option | REQ-006.2, REQ-006.3 |
| Model not in static registry | Metadata resolution fallback | Applies 8192 ctx / 4096 MB VRAM defaults | Logs `WARN` in dev console; continues routing safely | REQ-005.2 |

### Testing Strategy

#### Unit Tests
- **Config Resolution**: Validate env var → config store → default hierarchy. Test invalid/OS-incompatible backend rejection. (REQ-001, REQ-003.4)
- **Backend Registry & Protocol**: Mock `BackendClient` implementations for Ollama, vLLM, llama.cpp. Verify no-op returns, VRAM/context fallback logic, and static registry merging. (REQ-002, REQ-005)
- **LiteLLM Prefix Mapping**: Assert correct provider prefix injection (`openai/`, `ollama_chat/`, etc.) and `LITELLM_EXTRA_PARAMS` header propagation. (REQ-006)

#### Integration Tests
- **Tauri IPC Dispatcher**: Verify routing of `fetch_tags_models`, `preload_generate`, and `pull_model` to active backend. Confirm structured error payloads for unsupported operations. (REQ-003)
- **Python Core + Router**: Test `ModelRouterConfig` extension with new `backend` field. Validate turn routing respects tier configuration across runtime switches. Mock backend failures to verify graceful degradation to static estimates. (REQ-002, REQ-006)

#### UI / E2E Tests (Playwright/Cypress)
- **Conditional Rendering**: Assert VRAM sliders are disabled/"managed externally" and pull button is hidden for vLLM/llama.cpp. Verify full panel renders for Ollama. (REQ-004.1, REQ-004.2)
- **Backend Switch & Cache Invalidation**: Trigger backend change in settings; verify model list and VRAM data are cleared on next mount. (REQ-004.3)
- **Timeout Handling**: Mock IPC delay > 2s; assert "Backend unavailable" banner appears and LLM controls are disabled. Verify restoration when mock returns healthy. (REQ-004.4)
- **Metadata Fallback**: Simulate missing backend + missing registry entry; verify conservative defaults (8192/4096) are applied without crashing routing. (REQ-005.2)

#### Non-Functional Checks
- **Performance**: Abstracted protocol dispatch overhead measured against direct Ollama calls (< 5ms added per lifecycle operation).
- **Backward Compatibility**: Existing `ollama` behavior unchanged; LiteLLM routing, session generation, and TUI widgets operate identically when backend is `ollama`.
- **Security**: Backend URLs validated against allowed schemes (`http://`, `https://`). API keys injected strictly via `LITELLM_EXTRA_PARAMS`, never logged or exposed in UI.