# Implementation Plan: Multiple LLM Managers

## Overview

This plan implements a pluggable local LLM backend abstraction across Python (protocol + registry + metadata), Rust/Tauri (config + IPC dispatcher), and TypeScript/React (types + hooks + UI). Tasks with `(depends: none)` can run in parallel. Each subtask targets ≤1 file.

## Task Dependency Graph

```json
{
  "waves": [
    {"id": "wave1", "tasks": ["1", "2", "3", "7", "9"], "description": "Independent foundations: config, metadata, protocol, Tauri config, TS types"},
    {"id": "wave2", "tasks": ["4", "5", "8", "10"], "description": "Registry, prefix mapping, IPC dispatcher, UI — depend on wave1"},
    {"id": "wave3", "tasks": ["6"], "description": "Auth injection — depends on prefix mapping"},
    {"id": "wave4", "tasks": ["11"], "description": "Final wiring and integration tests"}
  ]
}
```

## Tasks

- [x] 1. Python config resolver — _Requirements: REQ-001_ (depends: none)
  - [x] 1.1 Create `bright_vision_core/llm_backends/config.py` — implement `resolve_backend_config()` reading `BRIGHTVISION_LLM_BACKEND` env → persisted config → default `ollama`. Validate against `{ollama, llamacpp, vllm, tgi, mlx-lm}`. (REQ-001.1, REQ-001.2)
    - verify: `python -c "from bright_vision_core.llm_backends.config import resolve_backend_config; print(resolve_backend_config())"`
  - [x] 1.2 In same file, add `persist_backend_config()` and platform compatibility via `UNSUPPORTED_PLATFORMS` dict. (REQ-001.3, REQ-001.4)
    - verify: `python -c "from bright_vision_core.llm_backends.config import persist_backend_config, UNSUPPORTED_PLATFORMS"`
  - [ ] 1.3 Create `tests/core/test_backend_config.py` — tests: env var precedence, invalid backend fallback, OS incompatibility, persist round-trip. (REQ-001)
    - verify: `python -m pytest tests/core/test_backend_config.py -v`

- [ ] 2. Bundled metadata registry — _Requirements: REQ-005_ (depends: none)
  - [ ] 2.1 Create `bright_vision_core/llm_backends/metadata.json` — JSON with `{ "models": { ... } }` mapping ≥10 popular model names to `{ "max_context": N, "estimated_vram_mb": N }`. (REQ-005.1)
    - verify: `python -c "import json, pathlib; d=json.loads(pathlib.Path('bright_vision_core/llm_backends/metadata.json').read_text()); assert len(d['models'])>=10"`
  - [ ] 2.2 Create `bright_vision_core/llm_backends/metadata_resolver.py` — implement `resolve_static_metadata(model_name, user_override_mb=None)` → `{"max_context": int, "estimated_vram_mb": int}`. Priority: user override > registry > defaults (8192/4096) with WARN log. (REQ-005.1, REQ-005.2, REQ-005.3)
    - verify: `python -c "from bright_vision_core.llm_backends.metadata_resolver import resolve_static_metadata; assert resolve_static_metadata('nonexistent')['max_context']==8192"`
  - [ ] 2.3 Create `tests/core/test_metadata_resolver.py` — tests: known model lookup, unknown fallback, user override wins, WARN logged. (REQ-005)
    - verify: `python -m pytest tests/core/test_metadata_resolver.py -v`

- [ ] 3. Abstract backend protocol — _Requirements: REQ-002_ (depends: none)
  - [ ] 3.1 Create `bright_vision_core/llm_backends/base.py` — `BackendClient(Protocol)` with `preload_models`, `get_vram_usage`, `get_context_window`, `list_available_models`. (REQ-002.1)
    - verify: `python -c "from bright_vision_core.llm_backends.base import BackendClient"`
  - [ ] 3.2 Create `bright_vision_core/llm_backends/ollama_client.py` — `OllamaBackendClient` calling Ollama HTTP API. Wrap calls in try/except, log ERROR on timeout. (REQ-002.1, REQ-002.4)
    - verify: `python -c "from bright_vision_core.llm_backends.ollama_client import OllamaBackendClient"`
  - [ ] 3.3 Create `bright_vision_core/llm_backends/vllm_client.py` — `VLLMBackendClient`. `preload_models` → `[]`, `get_vram_usage` → `None`, `list_available_models` → GET `/v1/models` or `[]`. (REQ-002.2, REQ-002.3)
    - verify: `python -c "import asyncio; from bright_vision_core.llm_backends.vllm_client import VLLMBackendClient; assert asyncio.run(VLLMBackendClient('http://x').preload_models([]))==[]"`
  - [ ] 3.4 Create `bright_vision_core/llm_backends/llamacpp_client.py` — `LlamaCppBackendClient`. All methods return no-op/None/[]. (REQ-002.2, REQ-002.3)
    - verify: `python -c "import asyncio; from bright_vision_core.llm_backends.llamacpp_client import LlamaCppBackendClient; assert asyncio.run(LlamaCppBackendClient('http://x').get_vram_usage()) is None"`
  - [ ] 3.5 Create `tests/core/test_backend_clients.py` — mock each client: protocol compliance, ERROR logged on timeout, no-ops correct. (REQ-002)
    - verify: `python -m pytest tests/core/test_backend_clients.py -v`

- [ ] 4. Backend registry — _Requirements: REQ-002_ (depends: 1, 3)
  - [ ] 4.1 Create `bright_vision_core/llm_backends/registry.py` — `BackendRegistry` with `get_active()`, `set_active(name)`, `register(name, client)`. Lazily calls `resolve_backend_config()`. (REQ-002)
    - verify: `python -c "from bright_vision_core.llm_backends.registry import BackendRegistry"`
  - [ ] 4.2 Update `bright_vision_core/llm_backends/__init__.py` — export `BackendRegistry`, `BackendClient`, `resolve_backend_config`, `resolve_static_metadata`. (REQ-002)
    - verify: `python -c "from bright_vision_core.llm_backends import BackendRegistry, BackendClient"`
  - [ ] 4.3 Create `tests/core/test_backend_registry.py` — tests: defaults to ollama, set_active switches, unknown name raises, env override works. (REQ-002)
    - verify: `python -m pytest tests/core/test_backend_registry.py -v`

- [ ] 5. LiteLLM prefix mapping — _Requirements: REQ-006_ (depends: 1)
  - [ ] 5.1 In `bright_vision_core/model_router.py`, add `backend: str = "ollama"` and `provider_prefix: str = "ollama_chat/"` to `ModelRouterConfig` dataclass. (REQ-006.1)
    - verify: `python -c "from bright_vision_core.model_router import ModelRouterConfig; assert ModelRouterConfig().backend=='ollama'"`
  - [ ] 5.2 In same file, add `resolve_provider_prefix(backend: str) -> str`. Mapping: ollama→`ollama_chat/`, vllm/tgi→`openai/`, llamacpp→`openai/`. Wire into `__post_init__`. (REQ-006.1)
    - verify: `python -c "from bright_vision_core.model_router import resolve_provider_prefix; assert resolve_provider_prefix('vllm')=='openai/'"`
  - [ ] 5.3 Create `tests/core/test_router_prefix.py` — tests: each backend maps correctly, tier config preserved across switch. (REQ-006)
    - verify: `python -m pytest tests/core/test_router_prefix.py -v`

- [ ] 6. Auth/header injection — _Requirements: REQ-006_ (depends: 5)
  - [ ] 6.1 In `bright_vision_core/model_router.py`, add `inject_backend_extra_params(backend, extra_params) -> dict` — merges `LITELLM_EXTRA_PARAMS` for non-ollama backends. (REQ-006.4)
    - verify: `python -c "from bright_vision_core.model_router import inject_backend_extra_params; print(inject_backend_extra_params('vllm', {}))"`
  - [ ] 6.2 In `tests/core/test_router_prefix.py`, add test cases for injection: only non-ollama, no leak when env unset, existing params preserved. (REQ-006.4)
    - verify: `python -m pytest tests/core/test_router_prefix.py -v -k inject`

- [ ] 7. Tauri config resolver — _Requirements: REQ-001, REQ-003_ (depends: none)
  - [ ] 7.1 In `src-tauri/src/local_llm_config.rs`, add `"BRIGHTVISION_LLM_BACKEND"` to `KEYS`, add `backend: String` field to `LocalLlmSnapshot`, resolve from env → config → `"ollama"`. (REQ-001.1)
    - verify: `cargo check -p brightvision-desktop`
  - [ ] 7.2 In same file, add `fn validate_backend(backend: &str) -> Result<String, String>` checking `ALLOWED_BACKENDS` + `cfg!(target_os)`. Panic on malformed at init. (REQ-003.4)
    - verify: `cargo check -p brightvision-desktop`
  - [ ] 7.3 Add `#[cfg(test)]` module in same file — tests: valid/invalid names, platform check, panic behavior. (REQ-001, REQ-003)
    - verify: `cargo test -p brightvision-desktop -- local_llm_config`

- [ ] 8. Tauri IPC dispatcher — _Requirements: REQ-003_ (depends: 7)
  - [ ] 8.1 In `src-tauri/src/local_llm_runtime.rs`, add `LlmBackendDispatcher` struct holding backend name + `supports_operation(op)` method. (REQ-003.1, REQ-003.2)
    - verify: `cargo check -p brightvision-desktop`
  - [ ] 8.2 Modify `fetch_tags_models` to return `[]` for non-ollama. Modify `pull_model` to return structured error for non-ollama. (REQ-003.1, REQ-003.2)
    - verify: `cargo check -p brightvision-desktop`
  - [ ] 8.3 Ensure `preload_generate`, `touch_keep_alive`, `ping_generate` still route to `OllamaClient` when backend is ollama. (REQ-003.3)
    - verify: `cargo test -p brightvision-desktop -- local_llm_runtime`
  - [ ] 8.4 Add `#[cfg(test)]` tests — dispatcher routing, structured error shape, ollama backward compat. (REQ-003)
    - verify: `cargo test -p brightvision-desktop -- local_llm_runtime`

- [ ] 9. TypeScript types & hook — _Requirements: REQ-004_ (depends: none)
  - [ ] 9.1 In `src/ipc/localLlm.ts`, add `BackendCapabilities` interface and `backend`/`capabilities` fields to `LocalLlmSnapshot`. (REQ-004)
    - verify: `npx tsc --noEmit src/ipc/localLlm.ts`
  - [ ] 9.2 Create `src/hooks/useBackendCapabilities.ts` — returns `BackendCapabilities` derived from snapshot backend field. Ollama → all true; vllm/llamacpp → all false. (REQ-004.1, REQ-004.2)
    - verify: `npx tsc --noEmit src/hooks/useBackendCapabilities.ts`
  - [ ] 9.3 Create `src/hooks/__tests__/useBackendCapabilities.test.ts` — tests for each backend type's capability flags. (REQ-004)
    - verify: `yarn test --run -- useBackendCapabilities`

- [ ] 10. Frontend UI adaptation — _Requirements: REQ-004_ (depends: 9)
  - [ ] 10.1 In `LocalLlmPanel.tsx`, use `useBackendCapabilities()` to conditionally hide pull button and show "Managed externally" chip when supports_vram_query is false. (REQ-004.1, REQ-004.2)
    - verify: `npx tsc --noEmit src/components/local-llm/LocalLlmPanel.tsx`
  - [ ] 10.2 Add 2s timeout wrapper on IPC backend call — render `<Alert>Backend unavailable</Alert>` and disable controls on timeout. (REQ-004.4)
    - verify: `npx tsc --noEmit src/components/local-llm/LocalLlmPanel.tsx`
  - [ ] 10.3 Add cache invalidation in `useLocalLlmControls` — reset model/status state when `backend` changes. (REQ-004.3)
    - verify: `npx tsc --noEmit`
  - [ ] 10.4 Create `e2e/local-llm-backend.spec.ts` — Playwright: mock vllm backend, assert pull hidden + "Managed externally" shown; mock timeout, assert banner. (REQ-004)
    - verify: `npx playwright test e2e/local-llm-backend.spec.ts`

- [ ] 11. Wiring & cleanup — _Requirements: REQ-002, REQ-006_ (depends: 4, 5, 8)
  - [ ] 11.1 Delete empty `bright_vision_core/llm_backends/test_config.py`. Verify `__init__.py` exports are wired. (housekeeping)
    - verify: `python -c "import bright_vision_core.llm_backends"`
  - [ ] 11.2 In `model_router.py`, replace any direct Ollama HTTP calls with `BackendRegistry.get_active()` protocol calls for preload/VRAM. (REQ-002.1)
    - verify: `python -m pytest tests/core/test_model_router.py -v`
  - [ ] 11.3 Create `tests/core/test_backend_integration.py` — end-to-end: set `BRIGHTVISION_LLM_BACKEND=vllm`, verify registry → VLLMBackendClient, prefix → `openai/`, preload → no-op. (REQ-002, REQ-006)
    - verify: `python -m pytest tests/core/test_backend_integration.py -v`


## Notes

- Tasks 1, 2, 3, 7, and 9 have no dependencies and can execute in parallel.
- Task 11 is the final wiring pass — only attempt after 4, 5, and 8 are complete.
- Each `verify:` line is the minimum acceptance gate. If it fails, the subtask is not done.
- Tests live in `tests/core/` (Python) and inline `#[cfg(test)]` (Rust), not alongside source.
- The empty `bright_vision_core/llm_backends/test_config.py` from the initial commit should be deleted in task 11.1.
