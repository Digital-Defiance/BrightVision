# Implementation Plan: Model Priority Hopper

## Overview

Extend the local model router hopper to support multiple models per tier via numbered env vars (`THINK_MODEL_1`, `FAST_MODEL_2`, etc.) and a `MODEL_PRIORITY` env var that controls preload order and routing preference. Implementation spans three layers: Rust parser, TypeScript IPC/hopper/UI, and Python router — all backward-compatible with existing single-model env configurations.

## Tasks

- [x] 1. Extend Rust parser for multi-model tier slots and MODEL_PRIORITY
  - [x] 1.1 Add `TierSlotEntry` struct and extend `LocalLlmSnapshot` with `tier_slots`, `priority_list`, `model_priority_raw`, and `warnings` fields
    - Define `TierSlotEntry { tier: String, slot: u8, model_tag: String }` with `#[serde(rename_all = "camelCase")]`
    - Add `tier_slots: Vec<TierSlotEntry>`, `priority_list: Vec<String>`, `model_priority_raw: Option<String>`, `warnings: Vec<String>` to `LocalLlmSnapshot`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1_

  - [x] 1.2 Extend `parse_env_file` to accept numbered tier slot keys and `MODEL_PRIORITY`
    - Add `MODEL_PRIORITY` to the static `KEYS` array
    - In `parse_env_file`, after the static KEYS check, add a regex match for `^(FAST|CODE|THINK)_MODEL_[1-9]$` to accept numbered keys
    - Preserve both static and pattern-matched keys in the `vars` HashMap
    - _Requirements: 1.1, 1.2, 1.4, 2.1_

  - [x] 1.3 Implement `build_tier_slots` to produce `Vec<TierSlotEntry>` from parsed env vars
    - For each tier (FAST, CODE, THINK): emit slot 0 from the base key (`FAST_MODEL`, etc.) if non-empty
    - For numbered keys 1–9: emit corresponding slot entries, skipping empty/whitespace values
    - Sort entries by tier then slot number
    - _Requirements: 1.3, 1.5_

  - [x] 1.4 Implement `resolve_priority_list` to parse `MODEL_PRIORITY` or derive default ordering
    - When `MODEL_PRIORITY` is defined: split on comma, trim whitespace, skip empty segments
    - Resolve tier labels (e.g. `THINK`, `FAST_1`) to their configured model tags from `tier_slots`
    - Preserve raw model tags as-is
    - Skip unresolved tier labels and push warning to `warnings` vec
    - Deduplicate, keeping first occurrence
    - When `MODEL_PRIORITY` is not defined: derive default as all FAST slots (0..9), then CODE slots (0..9), then THINK slots (0..9), skipping unconfigured
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 1.5 Wire `build_tier_slots` and `resolve_priority_list` into `read_local_llm_config`
    - Call after all env files are parsed
    - Populate `tier_slots`, `priority_list`, `model_priority_raw`, and `warnings` on the returned `LocalLlmSnapshot`
    - Ensure existing fields (`fast_model`, `code_model`, `think_model`) are still populated for backward compat
    - _Requirements: 7.1_

  - [x] 1.6 Write Rust property tests for tier slot parsing and priority resolution (proptest)
    - **Property 1: Tier slot parsing round-trip**
    - **Property 2: Base key is slot 0**
    - **Property 3: MODEL_PRIORITY parsing preserves order and resolves labels**
    - **Property 4: Invalid tier label skip**
    - **Property 5: Default priority derivation**
    - **Property 14: Backward compatibility — parser**
    - **Validates: Requirements 1.1–1.5, 2.2–2.6, 7.1**

- [x] 2. Checkpoint - Ensure Rust tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Extend TypeScript IPC and hopper for multi-model snapshots
  - [x] 3.1 Add `TierSlotEntry` interface and extend `LocalLlmSnapshot` in `src/ipc/localLlm.ts`
    - Add `TierSlotEntry { tier: 'fast' | 'code' | 'think'; slot: number; modelTag: string }`
    - Add `tierSlots?: TierSlotEntry[]`, `priorityList?: string[]`, `modelPriorityRaw?: string | null`, `warnings?: string[]` to `LocalLlmSnapshot`
    - _Requirements: 1.1, 2.1_

  - [x] 3.2 Extend `ModelHopperEntry` with `priorityRank` and `tierSlot` fields in `src/theme/modelHopper.ts`
    - Add optional `priorityRank?: number` (0 = highest)
    - Add optional `tierSlot?: number` (0 = base key, 1-9 = numbered)
    - _Requirements: 5.1, 5.2_

  - [x] 3.3 Implement `buildHopperFromSnapshot` in `src/theme/modelHopper.ts`
    - Given a `LocalLlmSnapshot` with `tierSlots` and `priorityList`, produce `ModelHopperEntry[]`
    - Create one entry per tier slot, ordered by priority list rank
    - Assign `priorityRank` based on position in `priorityList`
    - _Requirements: 6.1, 6.2_

  - [x] 3.4 Implement `applyPriorityOrder` in `src/theme/modelHopper.ts`
    - Reorder entries within each tier to match a given priority list
    - Models earlier in the priority list appear first within their tier group
    - _Requirements: 5.2, 6.2_

  - [x] 3.5 Update `applyLocalLlmHopperFromEnv` in `src/theme/modelRouterPrefs.ts` to use multi-model snapshot
    - When `snap.tierSlots` is present and has multiple entries, call `buildHopperFromSnapshot` instead of the legacy single-model path
    - Fall back to existing logic when `tierSlots` is absent (backward compat)
    - _Requirements: 6.1, 6.2, 7.3_

  - [x] 3.6 Extend `modelRouterApiPayload` to include `priority_list` and `priority_rank` in the payload
    - Add `priority_list` array to the API payload (model tags in priority order)
    - Add `priority_rank` field to each `model_pool` entry based on hopper list position
    - _Requirements: 5.5_

  - [x] 3.7 Write TypeScript property tests (fast-check) for snapshot-to-hopper conversion and payload generation
    - **Property 12: Hopper payload reflects order**
    - **Property 13: Sync from env rebuilds hopper with correct ordering**
    - **Property 14: Backward compatibility — parser (TS consumer side)**
    - **Validates: Requirements 5.5, 6.1, 6.2, 7.1, 7.3**

- [x] 4. Checkpoint - Ensure TypeScript tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Extend Python router for priority-aware preloading and routing
  - [x] 5.1 Add `priority_rank` and `priority_list` to `ModelRouterConfig` and `ModelPoolEntry` in `model_router.py`
    - Add `priority_list: list[str]` field to `ModelRouterConfig` (default empty list)
    - Add `priority_rank: int | None = None` field to `ModelPoolEntry`
    - Parse `priority_list` and per-entry `priority_rank` from the session payload in `from_payload`
    - _Requirements: 4.1, 4.4_

  - [x] 5.2 Implement `resolve_tier_models` to return all enabled models for a tier sorted by priority rank
    - Filter pool to enabled entries in the given tier
    - Sort by `priority_rank` (ascending = highest priority first)
    - _Requirements: 4.1_

  - [x] 5.3 Implement `pick_tier_model` for priority-aware routing within a tier
    - Select model with lowest `priority_rank` among enabled models in the tier
    - When `prefer_secondary` is set and tier has ≥2 models, pick second-lowest rank
    - When tier has only one model and `prefer_secondary` is set, route to the single model
    - Return `(model_name, is_swap)` where `is_swap` is True when model not in `resident_models`
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.4 Implement `preload_priority_list` for priority-ordered preloading with VRAM budget
    - Accept priority list, Ollama client, and optional VRAM budget
    - Issue preload requests in index order (0 first)
    - Track cumulative VRAM; skip remaining models when budget exceeded
    - On preload failure: log error, skip model, continue with next
    - Return list of successfully preloaded model tags
    - _Requirements: 3.1, 3.2, 3.4_

  - [x] 5.5 Extend `RouteDecision` with priority metadata
    - Add `priority_rank: int | None = None` field
    - Add `priority_list_snapshot: list[str] | None = None` field
    - Populate in `classify_prompt` when multi-model pool is active
    - _Requirements: 4.4_

  - [x] 5.6 Integrate `pick_tier_model` into `classify_prompt` for multi-model tier routing
    - When a tier has multiple enabled entries with `priority_rank` set, use `pick_tier_model` instead of simple first-match
    - Preserve existing single-model-per-tier behavior when `priority_rank` is absent
    - _Requirements: 4.1, 7.2_

  - [x] 5.7 Write Python property tests (hypothesis) for routing and preload logic
    - **Property 6: Preload order matches Priority_List**
    - **Property 7: VRAM budget cutoff**
    - **Property 8: Keep-alive order matches Priority_List**
    - **Property 9: Route to highest-priority model in tier**
    - **Property 10: Non-resident model swap event**
    - **Property 11: Route event includes priority metadata**
    - **Property 15: Backward compatibility — router**
    - **Validates: Requirements 3.1–3.4, 4.1–4.4, 7.2**

- [x] 6. Checkpoint - Ensure Python tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Hopper UI — multi-model tier display
  - [x] 7.1 Create `TierModelGroup` component for multi-model tier rendering
    - Render tier heading with multiple model rows beneath it
    - Each row shows model tag, enabled toggle, and remove button
    - Remove button disabled when only one model remains in code tier
    - "Add model" button at the bottom populates from Ollama pulled tags
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 7.2 Update `ModelHopperPanel` (or equivalent settings section) to detect and render multi-model tiers
    - When `tierSlots` in snapshot has multiple entries per tier, render `TierModelGroup`
    - Single-model tiers render in existing flat layout (backward compat)
    - _Requirements: 5.1, 7.3_

  - [x] 7.3 Implement drag-to-reorder within tier groups
    - Allow reordering models within a tier (topmost = highest priority)
    - Persist updated order to localStorage via `saveModelRouterPrefs`
    - Regenerate API payload with new `priority_rank` values
    - UI order is authoritative after initial sync (overrides env priority)
    - _Requirements: 5.2, 5.5, 6.3, 6.4_

  - [x] 7.4 Write unit tests for TierModelGroup and multi-model hopper rendering
    - Test multi-model tier display (multiple rows grouped under tier heading)
    - Test backward compat: single-model layout unchanged
    - Test add/remove model interactions
    - _Requirements: 5.1, 5.3, 5.4, 7.3_

- [x] 8. Integration wiring — keep-alive and warmup in priority order
  - [x] 8.1 Update `local_llm_prepare_hopper` in Rust to accept priority-ordered entries
    - Respect `priority_rank` when iterating hopper entries for pull/preload
    - First entry with `preload: true` in priority order gets preloaded
    - _Requirements: 3.1_

  - [x] 8.2 Add keep-alive warmup in priority order to the Python router session lifecycle
    - Send keep-alive requests in priority list order (index 0 first, N-1 last)
    - Higher-priority models refresh TTL before lower-priority ones
    - _Requirements: 3.3_

  - [x] 8.3 Write integration test for env→Rust parse→IPC→TypeScript snapshot flow
    - Verify multi-model env file produces correct `tierSlots` and `priorityList` in TypeScript
    - Verify backward-compat env (no numbered keys) produces same snapshot as before
    - _Requirements: 7.1, 6.1_

- [x] 9. Update env example and documentation
  - [x] 9.1 Update `local-llm.env.example` with multi-model and MODEL_PRIORITY examples
    - Add commented examples for `THINK_MODEL_1`, `FAST_MODEL_1`, `MODEL_PRIORITY`
    - Keep existing single-model examples as the primary recommended config
    - _Requirements: 1.1, 2.1_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each layer (Rust → TypeScript → Python → UI)
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The Rust layer must be completed first since TypeScript and Python consume its output
- Backward compatibility is maintained at every layer — existing single-model env files work unchanged

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["1.5"] },
    { "id": 4, "tasks": ["1.6", "3.1"] },
    { "id": 5, "tasks": ["3.2", "5.1"] },
    { "id": 6, "tasks": ["3.3", "3.4", "5.2"] },
    { "id": 7, "tasks": ["3.5", "3.6", "5.3", "5.4"] },
    { "id": 8, "tasks": ["3.7", "5.5", "5.6"] },
    { "id": 9, "tasks": ["5.7", "7.1"] },
    { "id": 10, "tasks": ["7.2", "7.3"] },
    { "id": 11, "tasks": ["7.4", "8.1", "8.2"] },
    { "id": 12, "tasks": ["8.3", "9.1"] }
  ]
}
```
