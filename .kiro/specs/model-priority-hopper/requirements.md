# Requirements Document

## Introduction

Extend the local model router's hopper system to support multiple models per tier and a `MODEL_PRIORITY` env var that controls preload order and routing preference. On Apple Silicon with limited unified memory, priority determines which models stay resident in Ollama and which are evicted first. The feature allows users to assign numbered slots within a tier (e.g. `THINK_MODEL_1`, `THINK_MODEL_2`) and specify a global priority ordering by model tag or tier label.

## Glossary

- **Hopper**: The ordered pool of local models in Settings that the model router draws from when routing turns to fast/code/think tiers.
- **Tier**: A routing classification — one of `FAST`, `CODE`, or `THINK` — that determines which model handles a given prompt.
- **Tier_Slot**: A numbered env var binding a model to a tier position (e.g. `THINK_MODEL`, `THINK_MODEL_1`, `THINK_MODEL_2`).
- **Model_Tag**: An Ollama model identifier string (e.g. `qwen2.5-coder:7b`, `deepseek-r1:70b`).
- **Priority_List**: The ordered sequence in `MODEL_PRIORITY` that determines preload order and routing preference within a tier.
- **Preload**: Loading a model into Ollama VRAM/unified memory so it is ready for inference without cold-start latency.
- **Resident_Model**: A model currently loaded in Ollama memory (visible in `ollama ps`).
- **Eviction**: Ollama unloading a model from memory to make room for another.
- **Env_Config**: The `local-llm.env` file (or XDG `~/.config/local-llm/env`) that BrightVision reads on launch.
- **Rust_Parser**: The `local_llm_config.rs` module that reads env files with a KEYS allowlist and produces `LocalLlmSnapshot`.
- **Python_Router**: The `model_router.py` module that classifies prompts and picks the model for each turn.

## Requirements

### Requirement 1: Multi-Model Tier Slots

**User Story:** As a power user with multiple models pulled in Ollama, I want to assign more than one model per tier, so that I can have fallback options and rotation within a single routing tier.

#### Acceptance Criteria

1. WHEN an Env_Config file contains a key matching the pattern `{TIER}_MODEL_{N}` where TIER is one of FAST, CODE, or THINK and N is a positive integer, THE Rust_Parser SHALL parse the value as a Model_Tag and include it in the LocalLlmSnapshot.
2. THE Rust_Parser SHALL accept numbered Tier_Slot keys from 1 through 9 for each tier (e.g. `FAST_MODEL_1` through `FAST_MODEL_9`).
3. WHEN both `THINK_MODEL` and `THINK_MODEL_1` are defined, THE Rust_Parser SHALL treat `THINK_MODEL` as slot 0 (highest priority within the tier) and `THINK_MODEL_1` as slot 1.
4. THE Rust_Parser SHALL add all `{TIER}_MODEL_{N}` key patterns to the KEYS allowlist so they are not silently discarded during env file parsing.
5. WHEN a numbered Tier_Slot value is empty or whitespace-only, THE Rust_Parser SHALL ignore that slot and exclude it from the snapshot.

### Requirement 2: MODEL_PRIORITY Env Var — Parsing

**User Story:** As an Apple Silicon user with limited unified memory, I want to specify a global priority ordering for my models, so that the most important models are preloaded first and stay resident longest.

#### Acceptance Criteria

1. THE Rust_Parser SHALL recognize `MODEL_PRIORITY` as a valid key in the KEYS allowlist.
2. WHEN `MODEL_PRIORITY` contains a comma-separated list of Model_Tag values (e.g. `qwen2.5-coder:7b,deepseek-r1:70b`), THE Rust_Parser SHALL parse them as an ordered Priority_List preserving left-to-right order.
3. WHEN `MODEL_PRIORITY` contains tier labels (e.g. `FAST,CODE,THINK,THINK_1`), THE Rust_Parser SHALL resolve each label to the corresponding configured Model_Tag from the Tier_Slot env vars.
4. WHEN `MODEL_PRIORITY` contains a mix of tier labels and Model_Tag values, THE Rust_Parser SHALL resolve tier labels to their Model_Tag and preserve raw Model_Tag values as-is.
5. IF a tier label in `MODEL_PRIORITY` references an unconfigured Tier_Slot (e.g. `THINK_2` but no `THINK_MODEL_2` defined), THEN THE Rust_Parser SHALL skip that entry and log a warning.
6. IF `MODEL_PRIORITY` is not defined in any Env_Config file, THEN THE Rust_Parser SHALL derive a default priority from the tier order: all FAST models, then CODE models, then THINK models, in slot-number order within each tier.

### Requirement 3: MODEL_PRIORITY — Preload Ordering

**User Story:** As a user on a memory-constrained Apple Silicon machine, I want models preloaded in my specified priority order, so that high-priority models are warm and low-priority models are loaded only when needed.

#### Acceptance Criteria

1. WHEN a session starts and the model router is enabled, THE Python_Router SHALL preload models in Priority_List order (index 0 first, index N last).
2. WHILE the total estimated VRAM of preloaded models exceeds available unified memory, THE Python_Router SHALL skip preloading remaining models in the Priority_List and log which models were deferred.
3. WHEN the Ollama warmup sequence runs, THE Python_Router SHALL send keep-alive requests in Priority_List order so that higher-priority models refresh their TTL before lower-priority ones.
4. IF a preload request to Ollama fails for a specific Model_Tag, THEN THE Python_Router SHALL log the failure, skip that model, and continue preloading the next model in the Priority_List.

### Requirement 4: MODEL_PRIORITY — Routing Preference

**User Story:** As a user, I want the router to prefer higher-priority models within a tier when multiple models are available, so that my most capable or most-used model handles prompts first.

#### Acceptance Criteria

1. WHEN multiple models are configured for the same tier, THE Python_Router SHALL route to the highest-priority model (lowest Priority_List index) among enabled models in that tier.
2. WHEN the highest-priority model in a tier is not currently Resident (not in `ollama ps`), THE Python_Router SHALL still route to it but record a `swap` event indicating cold-start latency.
3. WHEN a `prefer_secondary` flag is set on a tier entry in the hopper UI, THE Python_Router SHALL route to the second-highest-priority model in that tier instead of the first.
4. THE Python_Router SHALL expose the resolved Priority_List in the route decision event so the UI can display which model was chosen and its priority rank.

### Requirement 5: Hopper UI — Multi-Model Tier Display

**User Story:** As a user configuring my local models in Settings, I want to see and manage multiple models within a single tier, so that I can add, remove, reorder, and enable/disable individual models per tier.

#### Acceptance Criteria

1. WHEN the LocalLlmSnapshot contains multiple Tier_Slot entries for the same tier, THE Hopper_UI SHALL display each model as a separate row grouped under that tier heading.
2. THE Hopper_UI SHALL allow the user to reorder models within a tier, where the topmost enabled model has highest routing priority.
3. THE Hopper_UI SHALL allow the user to add a new model row to any tier, populating it from Ollama's pulled tags list.
4. THE Hopper_UI SHALL allow the user to remove a model row from a tier, provided at least one model remains in the code tier.
5. WHEN the user reorders or adds models within a tier via the Hopper_UI, THE Hopper_UI SHALL persist the updated order to localStorage and regenerate the hopper API payload with the new priority.

### Requirement 6: Priority Sync Between Env and UI

**User Story:** As a user, I want my `MODEL_PRIORITY` env changes to reflect in the hopper UI on sync, and vice versa, so that there is a single source of truth for model ordering.

#### Acceptance Criteria

1. WHEN the user clicks "Sync from env" in Settings, THE Hopper_UI SHALL rebuild the hopper entries from the Env_Config including all numbered Tier_Slots and the MODEL_PRIORITY ordering.
2. WHEN `MODEL_PRIORITY` is defined in Env_Config, THE Hopper_UI SHALL order hopper rows to match the Priority_List (highest priority at top of each tier group).
3. WHEN the user reorders models in the Hopper_UI, THE Hopper_UI SHALL NOT write back to the Env_Config file (env files remain read-only from the UI perspective).
4. WHEN both `MODEL_PRIORITY` ordering and hopper UI drag-order conflict, THE Hopper_UI SHALL prefer the user's drag-order after the initial sync (UI is authoritative at runtime).

### Requirement 7: Backward Compatibility

**User Story:** As an existing user with a single model per tier in my env file, I want the system to continue working without changes to my configuration, so that the upgrade is non-breaking.

#### Acceptance Criteria

1. WHEN no numbered Tier_Slot keys and no `MODEL_PRIORITY` key exist in Env_Config, THE Rust_Parser SHALL produce the same LocalLlmSnapshot as the previous implementation.
2. WHEN only `FAST_MODEL`, `CODE_MODEL`, and `THINK_MODEL` are defined (no numbered variants), THE Python_Router SHALL route identically to the current single-model-per-tier behavior.
3. THE Hopper_UI SHALL display existing single-model configurations in the same layout as before (one row per tier, no grouping header).
