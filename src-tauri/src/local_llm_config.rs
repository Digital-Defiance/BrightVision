//! Read `local-llm.env` from standard paths (later files win). See docs/LOCAL_LLM.md.

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const KEYS: &[&str] = &[
    "LLM_MODE",
    "LLM_MODEL",
    "DATA_MODEL",
    "CHAT_MODEL",
    "EMBEDDING_MODEL",
    "INDEX_MODEL",
    "OLLAMA_HOST",
    "BRIGHTVISION_LLM_BACKEND",
    "BRIGHTVISION_LLM_BACKEND_URL",
    "OPENAI_API_BASE",
    "OPENAI_API_KEY",
    "BRIGHTVISION_LLM_LOAD_CONTEXT_LENGTH",
    "BRIGHTVISION_LLM_LOAD_PARALLEL",
    "BRIGHTVISION_LLM_LOAD_TTL",
    "FAST_MODEL",
    "HEAVY_MODEL",
    "CODE_MODEL",
    "THINK_MODEL",
    "MODEL_ROUTER",
    "FAST_THINK",
    "CODE_THINK",
    "DATA_THINK",
    "MODEL_PRIORITY",
    "PREFER_WARM",
];

/// Allowed local LLM backends (mirrors ``bright_vision_core.llm_backends.config``).
pub const ALLOWED_BACKENDS: &[&str] = &["ollama", "lmstudio", "llamacpp", "vllm", "tgi", "mlx-lm"];

/// A numbered tier slot binding a model to a tier position.
/// Slot 0 = the base key (e.g. `THINK_MODEL`); slots 1–9 = numbered keys.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TierSlotEntry {
    /// Tier label: "fast", "code", or "think".
    pub tier: String,
    /// Slot number: 0 = base key, 1–9 = numbered env vars.
    pub slot: u8,
    /// Ollama model tag (e.g. `qwen2.5-coder:7b`).
    pub model_tag: String,
    /// Whether this model supports vision/multimodal input (from `*_VISION=1` env).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vision: Option<bool>,
    /// Max context window in tokens (from `*_MAX_CONTEXT=N` env).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_context: Option<u32>,
    /// Per-slot LiteLLM think mode (from `*_THINK=0|1` env). Overrides tier-level CODE_THINK/FAST_THINK.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_thinking: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmSnapshot {
    pub sources: Vec<String>,
    pub ollama_host: Option<String>,
    pub data_model: Option<String>,
    pub llm_mode: Option<String>,
    /// Ollama tag for router fast tier (`FAST_MODEL` in env).
    pub fast_model: Option<String>,
    /// Ollama tag for router code tier (`CODE_MODEL` or legacy `HEAVY_MODEL`).
    pub code_model: Option<String>,
    /// Legacy alias for code tier (`HEAVY_MODEL` in env).
    pub heavy_model: Option<String>,
    /// Ollama tag for router think/reasoning tier (`THINK_MODEL` in env).
    pub think_model: Option<String>,
    /// When set, enables Settings → Local model router on sync / startup fill.
    pub model_router: Option<bool>,
    /// LiteLLM ``think`` for fast tier hopper row (`FAST_THINK=0|1`).
    pub fast_think: Option<bool>,
    /// LiteLLM ``think`` for code tier hopper row (`CODE_THINK=0|1`).
    pub code_think: Option<bool>,
    /// App path when `local-llm.env` or `local-llm/local-llm.env` exists under the install root.
    pub repo_local_llm_root: Option<String>,
    /// Multi-model tier slots parsed from env (base keys as slot 0, numbered as 1–9).
    pub tier_slots: Vec<TierSlotEntry>,
    /// Resolved priority list from `MODEL_PRIORITY` or derived default (model tags in priority order).
    pub priority_list: Vec<String>,
    /// Raw `MODEL_PRIORITY` env value (`None` when not set).
    pub model_priority_raw: Option<String>,
    /// Warnings generated during parsing (e.g. unresolved tier labels in MODEL_PRIORITY).
    pub warnings: Vec<String>,
    /// When true, prefer already-loaded models over cold-starting the highest-priority one.
    pub prefer_warm: Option<bool>,
    /// Active local LLM backend (`BRIGHTVISION_LLM_BACKEND` → config.json → `ollama`).
    pub backend: String,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn app_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn resolve_path(path: &Path, base: &Path) -> PathBuf {
    let p = if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    };
    std::fs::canonicalize(&p).unwrap_or(p)
}

fn display_path(path: &Path) -> String {
    std::fs::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

/// Check if a key matches the pattern `^(FAST|CODE|THINK)_MODEL_[1-9]$` for numbered tier slots.
fn is_numbered_tier_slot(key: &str) -> bool {
    // Must end with _MODEL_N where N is a single digit 1-9
    let Some(prefix) = key.strip_suffix(|c: char| c.is_ascii_digit() && c != '0') else {
        return false;
    };
    // After stripping the digit, check for known tier prefixes with _MODEL_
    matches!(prefix, "FAST_MODEL_" | "CODE_MODEL_" | "THINK_MODEL_")
}

/// Check if a key is a per-model capability env var:
/// `{TIER}_MODEL_VISION`, `{TIER}_MODEL_{N}_VISION`,
/// `{TIER}_MODEL_MAX_CONTEXT`, `{TIER}_MODEL_{N}_MAX_CONTEXT`,
/// `{TIER}_MODEL_THINK`, `{TIER}_MODEL_{N}_THINK`.
fn is_model_capability_key(key: &str) -> bool {
    // Check for _VISION suffix
    if let Some(prefix) = key.strip_suffix("_VISION") {
        return matches!(
            prefix,
            "FAST_MODEL" | "CODE_MODEL" | "THINK_MODEL"
                | "FAST_MODEL_1" | "FAST_MODEL_2" | "FAST_MODEL_3"
                | "FAST_MODEL_4" | "FAST_MODEL_5" | "FAST_MODEL_6"
                | "FAST_MODEL_7" | "FAST_MODEL_8" | "FAST_MODEL_9"
                | "CODE_MODEL_1" | "CODE_MODEL_2" | "CODE_MODEL_3"
                | "CODE_MODEL_4" | "CODE_MODEL_5" | "CODE_MODEL_6"
                | "CODE_MODEL_7" | "CODE_MODEL_8" | "CODE_MODEL_9"
                | "THINK_MODEL_1" | "THINK_MODEL_2" | "THINK_MODEL_3"
                | "THINK_MODEL_4" | "THINK_MODEL_5" | "THINK_MODEL_6"
                | "THINK_MODEL_7" | "THINK_MODEL_8" | "THINK_MODEL_9"
        );
    }
    // Check for _MAX_CONTEXT suffix
    if let Some(prefix) = key.strip_suffix("_MAX_CONTEXT") {
        return matches!(
            prefix,
            "FAST_MODEL" | "CODE_MODEL" | "THINK_MODEL"
                | "FAST_MODEL_1" | "FAST_MODEL_2" | "FAST_MODEL_3"
                | "FAST_MODEL_4" | "FAST_MODEL_5" | "FAST_MODEL_6"
                | "FAST_MODEL_7" | "FAST_MODEL_8" | "FAST_MODEL_9"
                | "CODE_MODEL_1" | "CODE_MODEL_2" | "CODE_MODEL_3"
                | "CODE_MODEL_4" | "CODE_MODEL_5" | "CODE_MODEL_6"
                | "CODE_MODEL_7" | "CODE_MODEL_8" | "CODE_MODEL_9"
                | "THINK_MODEL_1" | "THINK_MODEL_2" | "THINK_MODEL_3"
                | "THINK_MODEL_4" | "THINK_MODEL_5" | "THINK_MODEL_6"
                | "THINK_MODEL_7" | "THINK_MODEL_8" | "THINK_MODEL_9"
        );
    }
    // Check for _THINK suffix (per-slot think mode)
    if let Some(prefix) = key.strip_suffix("_THINK") {
        return matches!(
            prefix,
            "FAST_MODEL" | "CODE_MODEL" | "THINK_MODEL"
                | "FAST_MODEL_1" | "FAST_MODEL_2" | "FAST_MODEL_3"
                | "FAST_MODEL_4" | "FAST_MODEL_5" | "FAST_MODEL_6"
                | "FAST_MODEL_7" | "FAST_MODEL_8" | "FAST_MODEL_9"
                | "CODE_MODEL_1" | "CODE_MODEL_2" | "CODE_MODEL_3"
                | "CODE_MODEL_4" | "CODE_MODEL_5" | "CODE_MODEL_6"
                | "CODE_MODEL_7" | "CODE_MODEL_8" | "CODE_MODEL_9"
                | "THINK_MODEL_1" | "THINK_MODEL_2" | "THINK_MODEL_3"
                | "THINK_MODEL_4" | "THINK_MODEL_5" | "THINK_MODEL_6"
                | "THINK_MODEL_7" | "THINK_MODEL_8" | "THINK_MODEL_9"
        );
    }
    false
}

fn parse_env_file(path: &Path, into: &mut HashMap<String, String>) -> bool {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return false;
    };
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if !KEYS.contains(&key) && !key.starts_with("BV_") && !is_numbered_tier_slot(key) && !is_model_capability_key(key) {
            continue;
        }
        let mut value = value.trim().to_string();
        if (value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\''))
        {
            value = value[1..value.len() - 1].to_string();
        }
        into.insert(key.to_string(), value);
    }
    true
}

/// Build tier slot entries from parsed env vars.
///
/// For each tier (fast, code, think) in order:
///   - Slot 0 comes from the base key (e.g. `FAST_MODEL`) if non-empty after trimming.
///   - Slots 1–9 come from numbered keys (e.g. `FAST_MODEL_1`) if non-empty after trimming.
///
/// The result is naturally sorted by tier order then slot number.
fn build_tier_slots(vars: &HashMap<String, String>) -> Vec<TierSlotEntry> {
    let tiers: &[(&str, &str)] = &[
        ("fast", "FAST_MODEL"),
        ("code", "CODE_MODEL"),
        ("think", "THINK_MODEL"),
    ];

    let mut entries = Vec::new();

    for &(tier_label, base_key) in tiers {
        // Slot 0: base key
        if let Some(value) = vars.get(base_key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                let vision_key = format!("{}_VISION", base_key);
                let ctx_key = format!("{}_MAX_CONTEXT", base_key);
                let think_key = format!("{}_THINK", base_key);
                entries.push(TierSlotEntry {
                    tier: tier_label.to_string(),
                    slot: 0,
                    model_tag: trimmed.to_string(),
                    vision: vars.get(&vision_key).and_then(|v| parse_bool_env(v)),
                    max_context: vars.get(&ctx_key).and_then(|v| v.trim().parse::<u32>().ok()).filter(|&n| n > 0),
                    enable_thinking: vars.get(&think_key).and_then(|v| parse_bool_env(v)),
                });
            }
        }

        // Slots 1–9: numbered keys
        for n in 1..=9u8 {
            let key = format!("{}_{}", base_key, n);
            if let Some(value) = vars.get(&key) {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    let vision_key = format!("{}_{}_VISION", base_key, n);
                    let ctx_key = format!("{}_{}_MAX_CONTEXT", base_key, n);
                    let think_key = format!("{}_{}_THINK", base_key, n);
                    entries.push(TierSlotEntry {
                        tier: tier_label.to_string(),
                        slot: n,
                        model_tag: trimmed.to_string(),
                        vision: vars.get(&vision_key).and_then(|v| parse_bool_env(v)),
                        max_context: vars.get(&ctx_key).and_then(|v| v.trim().parse::<u32>().ok()).filter(|&n| n > 0),
                        enable_thinking: vars.get(&think_key).and_then(|v| parse_bool_env(v)),
                    });
                }
            }
        }
    }

    entries
}

fn resolve_chat_model(vars: &HashMap<String, String>) -> Option<String> {
    for key in ["LLM_MODEL", "DATA_MODEL", "CHAT_MODEL"] {
        if let Some(v) = vars.get(key).filter(|s| !s.trim().is_empty()) {
            return Some(v.trim().to_string());
        }
    }
    None
}

fn resolve_router_tag(vars: &HashMap<String, String>, key: &str) -> Option<String> {
    vars.get(key)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn parse_bool_env(value: &str) -> Option<bool> {
    match value.trim().to_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Some(true),
        "0" | "false" | "no" | "off" => Some(false),
        _ => None,
    }
}

fn config_file_paths(hint_root: Option<&str>) -> Vec<PathBuf> {
    let root = app_root();
    let mut paths: Vec<PathBuf> = Vec::new();
    if let Some(home) = home_dir() {
        let config_home = std::env::var("XDG_CONFIG_HOME")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".config"));
        paths.push(config_home.join("local-llm/env"));
    }
    if let Ok(dir) = std::env::var("LOCAL_LLM_DIR") {
        if !dir.trim().is_empty() {
            paths.push(resolve_path(Path::new(dir.trim()), &root).join("local-llm.env"));
        }
    }
    if let Ok(bv) = std::env::var("BRIGHT_VISION_ROOT") {
        if !bv.trim().is_empty() {
            let bv_root = resolve_path(Path::new(bv.trim()), &root);
            paths.push(bv_root.join("local-llm.env"));
            paths.push(bv_root.join("local-llm").join("local-llm.env"));
        }
    }
    paths.push(root.join("local-llm.env"));
    paths.push(root.join("local-llm").join("local-llm.env"));
    if let Some(home) = home_dir() {
        paths.push(home.join("local-llm/local-llm.env"));
    }
    if let Some(hint) = hint_root {
        let h = hint.trim();
        if !h.is_empty() {
            paths.push(resolve_path(Path::new(h), &root).join("local-llm.env"));
        }
    }
    paths
}

fn brightvision_config_path() -> PathBuf {
    home_dir()
        .map(|h| h.join(".config").join("brightvision").join("config.json"))
        .unwrap_or_else(|| PathBuf::from(".config/brightvision/config.json"))
}

/// Backends unsupported on the current OS (mirrors Python ``UNSUPPORTED_PLATFORMS``).
fn unsupported_backends_on_platform() -> &'static [&'static str] {
    if cfg!(target_os = "macos") {
        &[]
    } else if cfg!(target_os = "linux") {
        &["mlx-lm"]
    } else if cfg!(target_os = "windows") {
        &["llamacpp", "vllm", "tgi", "mlx-lm"]
    } else {
        &[]
    }
}

/// Validate backend name and OS compatibility. Invalid names or unsupported platforms return ``Err``.
pub fn validate_backend(backend: &str) -> Result<String, String> {
    let name = backend.trim();
    if name.is_empty() {
        return Err("backend name is empty".into());
    }
    if !ALLOWED_BACKENDS.contains(&name) {
        return Err(format!(
            "invalid backend '{name}'; allowed: {}",
            ALLOWED_BACKENDS.join(", ")
        ));
    }
    if unsupported_backends_on_platform().contains(&name) {
        return Err(format!("backend '{name}' is not supported on this platform"));
    }
    Ok(name.to_string())
}

/// Read ``active_backend`` from persisted config. Panics when the file exists but is malformed.
fn read_persisted_active_backend_at(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    let raw = std::fs::read_to_string(path).unwrap_or_else(|e| {
        panic!(
            "malformed backend config at {}: read failed: {e}",
            path.display()
        );
    });
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap_or_else(|e| {
        panic!(
            "malformed backend config at {}: invalid JSON: {e}",
            path.display()
        );
    });
    let Some(obj) = value.as_object() else {
        panic!(
            "malformed backend config at {}: root must be a JSON object",
            path.display()
        );
    };
    match obj.get("active_backend") {
        None => None,
        Some(serde_json::Value::String(s)) if s.trim().is_empty() => None,
        Some(serde_json::Value::String(s)) => Some(s.trim().to_string()),
        Some(other) => panic!(
            "malformed backend config at {}: active_backend must be a string, got {other}",
            path.display()
        ),
    }
}

fn load_persisted_active_backend() -> Option<String> {
    read_persisted_active_backend_at(&brightvision_config_path())
}

/// Resolve active backend: env → ``~/.config/brightvision/config.json`` → env files → ``lmstudio`` (macOS) / ``ollama``.
fn resolve_backend(vars: &HashMap<String, String>) -> String {
    if let Ok(raw) = std::env::var("BRIGHTVISION_LLM_BACKEND") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return normalize_backend(trimmed);
        }
    }
    if let Some(raw) = load_persisted_active_backend() {
        return normalize_backend(&raw);
    }
    if let Some(raw) = vars.get("BRIGHTVISION_LLM_BACKEND") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return normalize_backend(trimmed);
        }
    }
    if cfg!(target_os = "macos") {
        "lmstudio".to_string()
    } else {
        "ollama".to_string()
    }
}

fn normalize_backend(raw: &str) -> String {
    match validate_backend(raw) {
        Ok(name) => name,
        Err(_) => "ollama".to_string(),
    }
}

/// Active backend for IPC dispatch (same resolution as [`read_local_llm_config`]).
pub fn active_backend(hint_root: Option<String>) -> String {
    let mut vars: HashMap<String, String> = HashMap::new();
    for path in config_file_paths(hint_root.as_deref()) {
        parse_env_file(&path, &mut vars);
    }
    resolve_backend(&vars)
}

fn repo_local_llm_root() -> Option<String> {
    let root = app_root();
    if root.join("local-llm.env").is_file() {
        return Some(display_path(&root));
    }
    let nested = root.join("local-llm").join("local-llm.env");
    if nested.is_file() {
        return Some(display_path(&root.join("local-llm")));
    }
    None
}

pub fn read_local_llm_config(hint_root: Option<String>) -> LocalLlmSnapshot {
    let mut vars: HashMap<String, String> = HashMap::new();
    let mut sources: Vec<String> = Vec::new();
    for path in config_file_paths(hint_root.as_deref()) {
        if parse_env_file(&path, &mut vars) {
            sources.push(display_path(&path));
        }
    }
    let model_router = vars
        .get("MODEL_ROUTER")
        .and_then(|v| parse_bool_env(v));
    let fast_think = vars.get("FAST_THINK").and_then(|v| parse_bool_env(v));
    let code_think = vars.get("CODE_THINK").and_then(|v| parse_bool_env(v));

    let code_model = resolve_router_tag(&vars, "CODE_MODEL")
        .or_else(|| resolve_router_tag(&vars, "HEAVY_MODEL"));
    let heavy_model = resolve_router_tag(&vars, "HEAVY_MODEL");
    let think_model = resolve_router_tag(&vars, "THINK_MODEL");

    let tier_slots = build_tier_slots(&vars);
    let model_priority_raw = vars.get("MODEL_PRIORITY").cloned();
    let mut warnings: Vec<String> = Vec::new();
    let priority_list = resolve_priority_list(model_priority_raw.as_deref(), &tier_slots, &mut warnings);
    let prefer_warm = vars.get("PREFER_WARM").and_then(|v| parse_bool_env(v));
    let backend = resolve_backend(&vars);

    LocalLlmSnapshot {
        ollama_host: vars.get("OLLAMA_HOST").cloned(),
        data_model: resolve_chat_model(&vars),
        llm_mode: vars.get("LLM_MODE").cloned(),
        fast_model: resolve_router_tag(&vars, "FAST_MODEL"),
        code_model: code_model.clone(),
        heavy_model,
        think_model,
        model_router,
        fast_think,
        code_think,
        repo_local_llm_root: repo_local_llm_root(),
        sources,
        tier_slots,
        priority_list,
        model_priority_raw,
        warnings,
        prefer_warm,
        backend,
    }
}

/// Try to parse a segment as a tier label (e.g. `FAST`, `CODE_1`, `THINK_2`).
/// Returns `Some((tier, slot))` if the segment matches a known pattern.
fn parse_tier_label(segment: &str) -> Option<(&'static str, u8)> {
    // Check exact base labels first
    match segment {
        "FAST" => return Some(("fast", 0)),
        "CODE" => return Some(("code", 0)),
        "THINK" => return Some(("think", 0)),
        _ => {}
    }
    // Check numbered patterns: FAST_N, CODE_N, THINK_N
    for (prefix, tier) in [("FAST_", "fast"), ("CODE_", "code"), ("THINK_", "think")] {
        if let Some(suffix) = segment.strip_prefix(prefix) {
            if let Ok(n) = suffix.parse::<u8>() {
                if n >= 1 && n <= 9 {
                    return Some((tier, n));
                }
            }
        }
    }
    None
}

/// Resolve `MODEL_PRIORITY` into an ordered list of model tags, or derive a default
/// ordering from tier_slots when `MODEL_PRIORITY` is not set.
fn resolve_priority_list(
    model_priority_raw: Option<&str>,
    tier_slots: &[TierSlotEntry],
    warnings: &mut Vec<String>,
) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    match model_priority_raw {
        Some(raw) => {
            for segment in raw.split(',') {
                let segment = segment.trim();
                if segment.is_empty() {
                    continue;
                }
                if let Some((tier, slot)) = parse_tier_label(segment) {
                    // It's a tier label — resolve to configured model tag
                    if let Some(entry) = tier_slots.iter().find(|e| e.tier == tier && e.slot == slot) {
                        let tag = entry.model_tag.clone();
                        if seen.insert(tag.clone()) {
                            result.push(tag);
                        }
                    } else {
                        warnings.push(format!(
                            "MODEL_PRIORITY: tier label '{}' has no configured slot",
                            segment
                        ));
                    }
                } else {
                    // Not a tier label — treat as raw model tag
                    let tag = segment.to_string();
                    if seen.insert(tag.clone()) {
                        result.push(tag);
                    }
                }
            }
        }
        None => {
            // Derive default: FAST slots (sorted by slot), then CODE, then THINK
            for tier in ["fast", "code", "think"] {
                let mut tier_entries: Vec<&TierSlotEntry> = tier_slots
                    .iter()
                    .filter(|e| e.tier == tier)
                    .collect();
                tier_entries.sort_by_key(|e| e.slot);
                for entry in tier_entries {
                    let tag = entry.model_tag.clone();
                    if seen.insert(tag.clone()) {
                        result.push(tag);
                    }
                }
            }
        }
    }

    result
}

/// Env vars from local-llm files for the Vision API subprocess (LiteLLM routing).
pub fn core_api_llm_env(hint_root: Option<&str>) -> HashMap<String, String> {
    let mut vars: HashMap<String, String> = HashMap::new();
    for path in config_file_paths(hint_root) {
        parse_env_file(&path, &mut vars);
    }
    let keys = [
        "BRIGHTVISION_LLM_BACKEND",
        "BRIGHTVISION_LLM_BACKEND_URL",
        "OPENAI_API_BASE",
        "OPENAI_API_KEY",
        "OLLAMA_HOST",
    ];
    let mut out: HashMap<String, String> = HashMap::new();
    for key in keys {
        if let Some(value) = vars.get(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                out.insert(key.to_string(), trimmed.to_string());
            }
        }
    }
    out
}

/// Return all `BV_*` keys found in the local-llm env file chain.
/// These are forwarded to the Vision API subprocess so users can configure
/// engine behavior (e.g. `BV_IMPLEMENT_DESIGN_MAX_CHARS`) from `~/.config/local-llm/env`.
pub fn bv_env_vars(hint_root: Option<&str>) -> HashMap<String, String> {
    let mut vars: HashMap<String, String> = HashMap::new();
    for path in config_file_paths(hint_root) {
        parse_env_file(&path, &mut vars);
    }
    vars.into_iter().filter(|(k, _)| k.starts_with("BV_")).collect()
}


#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use std::collections::HashMap;

    /// Strategy to generate a valid tier name.
    fn tier_strategy() -> impl Strategy<Value = &'static str> {
        prop_oneof![Just("FAST"), Just("CODE"), Just("THINK"),]
    }

    /// Strategy to generate a valid slot number (1–9).
    fn slot_strategy() -> impl Strategy<Value = u8> {
        1u8..=9u8
    }

    /// Strategy to generate a non-whitespace model tag (at least 1 char, no leading/trailing whitespace).
    fn model_tag_strategy() -> impl Strategy<Value = String> {
        // Generate a tag that looks like an Ollama model: alphanumeric + colon + dots + hyphens
        "[a-z][a-z0-9._-]{0,20}(:[a-z0-9._-]{1,10})?"
            .prop_filter("must not be empty", |s| !s.trim().is_empty())
    }

    /// Strategy to generate a whitespace-only string.
    fn whitespace_only_strategy() -> impl Strategy<Value = String> {
        prop_oneof![Just("".to_string()), Just(" ".to_string()), Just("  \t ".to_string()),]
    }

    // Feature: model-priority-hopper, Property 1: Tier slot parsing round-trip
    // Validates: Requirements 1.1, 1.2, 1.4, 1.5
    proptest! {
        #[test]
        fn prop_tier_slot_parsing_round_trip(
            tier in tier_strategy(),
            slot in slot_strategy(),
            tag in model_tag_strategy(),
        ) {
            // Build a key like FAST_MODEL_3
            let key = format!("{}_MODEL_{}", tier, slot);

            let mut vars: HashMap<String, String> = HashMap::new();
            vars.insert(key.clone(), tag.clone());

            let entries = build_tier_slots(&vars);

            // Should produce exactly one entry with correct tier, slot, and tag
            prop_assert_eq!(entries.len(), 1, "Expected 1 entry, got {:?}", entries);
            let entry = &entries[0];
            prop_assert_eq!(&entry.tier, &tier.to_lowercase());
            prop_assert_eq!(entry.slot, slot);
            prop_assert_eq!(&entry.model_tag, &tag);
        }

        #[test]
        fn prop_tier_slot_whitespace_only_produces_no_entry(
            tier in tier_strategy(),
            slot in slot_strategy(),
            ws_value in whitespace_only_strategy(),
        ) {
            let key = format!("{}_MODEL_{}", tier, slot);

            let mut vars: HashMap<String, String> = HashMap::new();
            vars.insert(key, ws_value);

            let entries = build_tier_slots(&vars);

            // Whitespace-only values produce no entry
            prop_assert!(entries.is_empty(), "Expected no entries, got {:?}", entries);
        }
    }

    // Feature: model-priority-hopper, Property 2: Base key is slot 0
    // Validates: Requirements 1.3
    proptest! {
        #[test]
        fn prop_base_key_is_slot_0(
            tier in tier_strategy(),
            base_tag in model_tag_strategy(),
            numbered_tag in model_tag_strategy(),
        ) {
            // Ensure the base and numbered tags are distinct
            prop_assume!(base_tag != numbered_tag);

            let base_key = format!("{}_MODEL", tier);
            let numbered_key = format!("{}_MODEL_1", tier);

            let mut vars: HashMap<String, String> = HashMap::new();
            vars.insert(base_key, base_tag.clone());
            vars.insert(numbered_key, numbered_tag.clone());

            let entries = build_tier_slots(&vars);

            // Should have exactly 2 entries for this tier
            let tier_lower = tier.to_lowercase();
            let tier_entries: Vec<&TierSlotEntry> = entries
                .iter()
                .filter(|e| e.tier == tier_lower)
                .collect();

            prop_assert_eq!(tier_entries.len(), 2, "Expected 2 tier entries, got {:?}", tier_entries);

            // Base key should be at slot 0
            let slot_0 = tier_entries.iter().find(|e| e.slot == 0);
            prop_assert!(slot_0.is_some(), "No slot 0 entry found");
            prop_assert_eq!(&slot_0.unwrap().model_tag, &base_tag);

            // Numbered key should be at slot 1
            let slot_1 = tier_entries.iter().find(|e| e.slot == 1);
            prop_assert!(slot_1.is_some(), "No slot 1 entry found");
            prop_assert_eq!(&slot_1.unwrap().model_tag, &numbered_tag);

            // Slot 0 has lower slot number (higher priority within tier)
            prop_assert!(slot_0.unwrap().slot < slot_1.unwrap().slot);
        }
    }

    // Feature: model-priority-hopper, Property 3: MODEL_PRIORITY parsing preserves order and resolves labels
    // Validates: Requirements 2.2, 2.3, 2.4
    proptest! {
        #[test]
        fn prop_model_priority_preserves_order_and_resolves(
            fast_tag in model_tag_strategy(),
            code_tag in model_tag_strategy(),
            think_tag in model_tag_strategy(),
            raw_extra_tag in model_tag_strategy(),
            // Generate a permutation of which items go first
            order_seed in 0u32..24u32,
        ) {
            // Ensure distinct tags to avoid dedup interference
            prop_assume!(fast_tag != code_tag && fast_tag != think_tag && code_tag != think_tag);
            prop_assume!(raw_extra_tag != fast_tag && raw_extra_tag != code_tag && raw_extra_tag != think_tag);

            // Set up tier_slots with base keys
            let tier_slots = vec![
                TierSlotEntry { tier: "fast".to_string(), slot: 0, model_tag: fast_tag.clone(), ..Default::default() },
                TierSlotEntry { tier: "code".to_string(), slot: 0, model_tag: code_tag.clone(), ..Default::default() },
                TierSlotEntry { tier: "think".to_string(), slot: 0, model_tag: think_tag.clone(), ..Default::default() },
            ];

            // Build a MODEL_PRIORITY that mixes tier labels and a raw tag
            // Use the order_seed to pick one of several arrangements
            let items: Vec<(&str, &str)> = match order_seed % 6 {
                0 => vec![("FAST", &fast_tag), ("CODE", &code_tag), ("THINK", &think_tag)],
                1 => vec![("THINK", &think_tag), ("FAST", &fast_tag), ("CODE", &code_tag)],
                2 => vec![("CODE", &code_tag), ("THINK", &think_tag), ("FAST", &fast_tag)],
                3 => vec![("FAST", &fast_tag), ("THINK", &think_tag), ("CODE", &code_tag)],
                4 => vec![("THINK", &think_tag), ("CODE", &code_tag), ("FAST", &fast_tag)],
                _ => vec![("CODE", &code_tag), ("FAST", &fast_tag), ("THINK", &think_tag)],
            };

            // Build priority string: tier labels + one raw tag at the end
            let mut priority_parts: Vec<String> = items.iter().map(|(label, _)| label.to_string()).collect();
            priority_parts.push(raw_extra_tag.clone());
            let priority_str = priority_parts.join(",");

            let mut warnings = Vec::new();
            let result = resolve_priority_list(Some(&priority_str), &tier_slots, &mut warnings);

            // (a) Order matches left-to-right input order
            let mut expected: Vec<&str> = items.iter().map(|(_, tag)| tag.as_ref()).collect();
            expected.push(&raw_extra_tag);

            prop_assert_eq!(result.len(), expected.len(), "Length mismatch: {:?} vs {:?}", result, expected);
            for (i, (got, want)) in result.iter().zip(expected.iter()).enumerate() {
                prop_assert_eq!(got, want, "Mismatch at position {}: got '{}', want '{}'", i, got, want);
            }

            // (b) No warnings for valid labels
            prop_assert!(warnings.is_empty(), "Unexpected warnings: {:?}", warnings);
        }
    }

    // Feature: model-priority-hopper, Property 4: Invalid tier label skip
    // Validates: Requirements 2.5
    proptest! {
        #[test]
        fn prop_invalid_tier_label_skip(
            fast_tag in model_tag_strategy(),
            raw_tag in model_tag_strategy(),
        ) {
            prop_assume!(fast_tag != raw_tag);

            // Only FAST slot 0 is configured
            let tier_slots = vec![
                TierSlotEntry { tier: "fast".to_string(), slot: 0, model_tag: fast_tag.clone(), ..Default::default() },
            ];

            // MODEL_PRIORITY references THINK_2 (unconfigured) and FAST (configured) and a raw tag
            let priority_str = format!("THINK_2,FAST,{}", raw_tag);

            let mut warnings = Vec::new();
            let result = resolve_priority_list(Some(&priority_str), &tier_slots, &mut warnings);

            // THINK_2 is unconfigured → skipped. FAST resolves. raw_tag preserved.
            prop_assert_eq!(result.len(), 2, "Expected 2 results, got {:?}", result);
            prop_assert_eq!(&result[0], &fast_tag, "First should be fast_tag");
            prop_assert_eq!(&result[1], &raw_tag, "Second should be raw_tag");

            // Warning should mention THINK_2
            prop_assert!(!warnings.is_empty(), "Expected a warning about THINK_2");
            prop_assert!(
                warnings.iter().any(|w| w.contains("THINK_2")),
                "Warning should reference THINK_2: {:?}", warnings
            );
        }
    }

    // Feature: model-priority-hopper, Property 5: Default priority derivation
    // Validates: Requirements 2.6
    proptest! {
        #[test]
        fn prop_default_priority_derivation(
            fast_tag in model_tag_strategy(),
            code_tag in model_tag_strategy(),
            think_tag in model_tag_strategy(),
            // Whether to include numbered slots
            include_fast_1 in prop::bool::ANY,
            include_think_1 in prop::bool::ANY,
        ) {
            // Ensure distinct tags
            prop_assume!(fast_tag != code_tag && fast_tag != think_tag && code_tag != think_tag);

            let fast_1_tag = format!("{}-alt", fast_tag);
            let think_1_tag = format!("{}-alt", think_tag);
            prop_assume!(fast_1_tag != code_tag && fast_1_tag != think_tag);
            prop_assume!(think_1_tag != fast_tag && think_1_tag != code_tag);

            let mut tier_slots = vec![
                TierSlotEntry { tier: "fast".to_string(), slot: 0, model_tag: fast_tag.clone(), ..Default::default() },
                TierSlotEntry { tier: "code".to_string(), slot: 0, model_tag: code_tag.clone(), ..Default::default() },
                TierSlotEntry { tier: "think".to_string(), slot: 0, model_tag: think_tag.clone(), ..Default::default() },
            ];

            if include_fast_1 {
                tier_slots.push(TierSlotEntry { tier: "fast".to_string(), slot: 1, model_tag: fast_1_tag.clone(), ..Default::default() });
            }
            if include_think_1 {
                tier_slots.push(TierSlotEntry { tier: "think".to_string(), slot: 1, model_tag: think_1_tag.clone(), ..Default::default() });
            }

            let mut warnings = Vec::new();
            // No MODEL_PRIORITY defined → derive default
            let result = resolve_priority_list(None, &tier_slots, &mut warnings);

            // Expected order: FAST slots (0, then 1 if present), CODE slots (0), THINK slots (0, then 1 if present)
            let mut expected: Vec<&str> = Vec::new();
            expected.push(&fast_tag);
            if include_fast_1 {
                expected.push(&fast_1_tag);
            }
            expected.push(&code_tag);
            expected.push(&think_tag);
            if include_think_1 {
                expected.push(&think_1_tag);
            }

            prop_assert_eq!(result.len(), expected.len(), "Length mismatch: {:?} vs {:?}", result, expected);
            for (i, (got, want)) in result.iter().zip(expected.iter()).enumerate() {
                prop_assert_eq!(got, *want, "Mismatch at position {}: got '{}', want '{}'", i, got, want);
            }

            prop_assert!(warnings.is_empty(), "No warnings expected for default derivation");
        }
    }

    // Feature: model-priority-hopper, Property 14: Backward compatibility — parser
    // Validates: Requirements 7.1
    proptest! {
        #[test]
        fn prop_backward_compat_parser(
            fast_tag in model_tag_strategy(),
            code_tag in model_tag_strategy(),
            think_tag in model_tag_strategy(),
        ) {
            prop_assume!(fast_tag != code_tag && fast_tag != think_tag && code_tag != think_tag);

            // Legacy env: only FAST_MODEL, CODE_MODEL, THINK_MODEL — no numbered, no MODEL_PRIORITY
            let mut vars: HashMap<String, String> = HashMap::new();
            vars.insert("FAST_MODEL".to_string(), fast_tag.clone());
            vars.insert("CODE_MODEL".to_string(), code_tag.clone());
            vars.insert("THINK_MODEL".to_string(), think_tag.clone());

            let tier_slots = build_tier_slots(&vars);

            // Should have exactly 3 base-key entries at slot 0
            prop_assert_eq!(tier_slots.len(), 3, "Expected 3 tier slots, got {:?}", tier_slots);
            for entry in &tier_slots {
                prop_assert_eq!(entry.slot, 0, "All slots should be 0 in legacy mode: {:?}", entry);
            }

            // Verify correct tiers
            let fast_entries: Vec<&TierSlotEntry> = tier_slots.iter().filter(|e| e.tier == "fast").collect();
            let code_entries: Vec<&TierSlotEntry> = tier_slots.iter().filter(|e| e.tier == "code").collect();
            let think_entries: Vec<&TierSlotEntry> = tier_slots.iter().filter(|e| e.tier == "think").collect();
            prop_assert_eq!(fast_entries.len(), 1);
            prop_assert_eq!(code_entries.len(), 1);
            prop_assert_eq!(think_entries.len(), 1);
            prop_assert_eq!(&fast_entries[0].model_tag, &fast_tag);
            prop_assert_eq!(&code_entries[0].model_tag, &code_tag);
            prop_assert_eq!(&think_entries[0].model_tag, &think_tag);

            // Default priority list should follow FAST→CODE→THINK ordering
            let mut warnings = Vec::new();
            let priority_list = resolve_priority_list(None, &tier_slots, &mut warnings);

            prop_assert_eq!(priority_list.len(), 3, "Expected 3 entries in priority list");
            prop_assert_eq!(&priority_list[0], &fast_tag, "First should be FAST");
            prop_assert_eq!(&priority_list[1], &code_tag, "Second should be CODE");
            prop_assert_eq!(&priority_list[2], &think_tag, "Third should be THINK");
            prop_assert!(warnings.is_empty(), "No warnings expected for legacy config");
        }
    }

    // =========================================================================
    // Integration tests: env file → parse → serialize → verify JSON structure
    // Task 8.3: Validates full env→Rust parse→IPC→TypeScript snapshot flow
    // Validates: Requirements 7.1, 6.1
    // =========================================================================

    /// Integration test: multi-model env file produces correct tierSlots and priorityList
    /// in the serialized JSON snapshot (matching the shape TypeScript consumes via IPC).
    #[test]
    fn integration_multi_model_env_produces_correct_snapshot_json() {
        use std::io::Write;

        // Create a temp env file with multi-model configuration
        let dir = std::env::temp_dir().join("bv_test_multi_model_env");
        let _ = std::fs::create_dir_all(&dir);
        let env_path = dir.join("local-llm.env");

        let env_content = r#"
OLLAMA_HOST=http://127.0.0.1:11434
DATA_MODEL=qwen3.6:27b-q4_K_M
FAST_MODEL=deepseek-coder:6.7b
FAST_MODEL_1=qwen2.5-coder:7b
CODE_MODEL=qwen3.6:27b-q4_K_M
THINK_MODEL=deepseek-r1:32b
THINK_MODEL_1=qwen3:30b-q4_K_M
THINK_MODEL_2=llama3:70b-q4_K_M
MODEL_ROUTER=1
MODEL_PRIORITY=THINK,CODE,FAST,FAST_1,THINK_1,THINK_2
"#;
        {
            let mut f = std::fs::File::create(&env_path).expect("create temp env file");
            f.write_all(env_content.as_bytes()).expect("write env content");
        }

        // Parse the env file directly
        let mut vars: HashMap<String, String> = HashMap::new();
        let parsed = parse_env_file(&env_path, &mut vars);
        assert!(parsed, "parse_env_file should succeed");

        // Build tier slots from parsed vars
        let tier_slots = build_tier_slots(&vars);
        let model_priority_raw = vars.get("MODEL_PRIORITY").cloned();
        let mut warnings: Vec<String> = Vec::new();
        let priority_list = resolve_priority_list(
            model_priority_raw.as_deref(),
            &tier_slots,
            &mut warnings,
        );

        // Construct the snapshot as read_local_llm_config would
        let snapshot = LocalLlmSnapshot {
            sources: vec![env_path.to_string_lossy().into_owned()],
            ollama_host: vars.get("OLLAMA_HOST").cloned(),
            data_model: Some("qwen3.6:27b-q4_K_M".to_string()),
            llm_mode: None,
            fast_model: Some("deepseek-coder:6.7b".to_string()),
            code_model: Some("qwen3.6:27b-q4_K_M".to_string()),
            heavy_model: None,
            think_model: Some("deepseek-r1:32b".to_string()),
            model_router: Some(true),
            fast_think: None,
            code_think: None,
            repo_local_llm_root: None,
            tier_slots,
            priority_list,
            model_priority_raw,
            warnings,
            prefer_warm: None,
            backend: "ollama".to_string(),
        };

        // Serialize to JSON (this is what gets sent over IPC to TypeScript)
        let json_str = serde_json::to_string_pretty(&snapshot)
            .expect("snapshot should serialize to JSON");
        let json: serde_json::Value = serde_json::from_str(&json_str)
            .expect("JSON should re-parse");

        assert_eq!(json["backend"].as_str().unwrap(), "ollama");

        // Verify tierSlots structure
        let tier_slots_json = json["tierSlots"].as_array()
            .expect("tierSlots should be an array");
        assert_eq!(tier_slots_json.len(), 6, "Should have 6 tier slot entries");

        // Verify each expected tier slot
        let expected_slots: Vec<(&str, u8, &str)> = vec![
            ("fast", 0, "deepseek-coder:6.7b"),
            ("fast", 1, "qwen2.5-coder:7b"),
            ("code", 0, "qwen3.6:27b-q4_K_M"),
            ("think", 0, "deepseek-r1:32b"),
            ("think", 1, "qwen3:30b-q4_K_M"),
            ("think", 2, "llama3:70b-q4_K_M"),
        ];
        for (i, (tier, slot, tag)) in expected_slots.iter().enumerate() {
            let entry = &tier_slots_json[i];
            assert_eq!(entry["tier"].as_str().unwrap(), *tier, "slot {} tier", i);
            assert_eq!(entry["slot"].as_u64().unwrap(), *slot as u64, "slot {} number", i);
            assert_eq!(entry["modelTag"].as_str().unwrap(), *tag, "slot {} modelTag", i);
        }

        // Verify priorityList (MODEL_PRIORITY=THINK,CODE,FAST,FAST_1,THINK_1,THINK_2)
        let priority_json = json["priorityList"].as_array()
            .expect("priorityList should be an array");
        let expected_priority = vec![
            "deepseek-r1:32b",      // THINK → slot 0
            "qwen3.6:27b-q4_K_M",  // CODE → slot 0
            "deepseek-coder:6.7b",  // FAST → slot 0
            "qwen2.5-coder:7b",    // FAST_1 → slot 1
            "qwen3:30b-q4_K_M",   // THINK_1 → slot 1
            "llama3:70b-q4_K_M",   // THINK_2 → slot 2
        ];
        assert_eq!(priority_json.len(), expected_priority.len(), "priority list length");
        for (i, expected_tag) in expected_priority.iter().enumerate() {
            assert_eq!(
                priority_json[i].as_str().unwrap(), *expected_tag,
                "priority position {}", i
            );
        }

        // Verify modelPriorityRaw is preserved
        assert_eq!(
            json["modelPriorityRaw"].as_str().unwrap(),
            "THINK,CODE,FAST,FAST_1,THINK_1,THINK_2"
        );

        // Verify no warnings for valid config
        let warnings_json = json["warnings"].as_array()
            .expect("warnings should be an array");
        assert!(warnings_json.is_empty(), "no warnings expected: {:?}", warnings_json);

        // Verify backward-compat fields are still populated
        assert_eq!(json["fastModel"].as_str().unwrap(), "deepseek-coder:6.7b");
        assert_eq!(json["codeModel"].as_str().unwrap(), "qwen3.6:27b-q4_K_M");
        assert_eq!(json["thinkModel"].as_str().unwrap(), "deepseek-r1:32b");
        assert_eq!(json["modelRouter"].as_bool().unwrap(), true);

        // Cleanup
        let _ = std::fs::remove_file(&env_path);
        let _ = std::fs::remove_dir(&dir);
    }

    /// Integration test: backward-compat env (no numbered keys, no MODEL_PRIORITY)
    /// produces the same snapshot shape as before — only slot-0 entries and default priority.
    /// Validates: Requirement 7.1
    #[test]
    fn integration_backward_compat_env_produces_legacy_snapshot() {
        use std::io::Write;

        let dir = std::env::temp_dir().join("bv_test_backward_compat_env");
        let _ = std::fs::create_dir_all(&dir);
        let env_path = dir.join("local-llm.env");

        // Legacy env: only base keys, no numbered slots, no MODEL_PRIORITY
        let env_content = r#"
OLLAMA_HOST=http://127.0.0.1:11434
DATA_MODEL=qwen3.6:27b-q4_K_M
FAST_MODEL=deepseek-coder:6.7b
CODE_MODEL=qwen3.6:27b-q4_K_M
THINK_MODEL=deepseek-r1:32b
MODEL_ROUTER=1
"#;
        {
            let mut f = std::fs::File::create(&env_path).expect("create temp env file");
            f.write_all(env_content.as_bytes()).expect("write env content");
        }

        let mut vars: HashMap<String, String> = HashMap::new();
        let parsed = parse_env_file(&env_path, &mut vars);
        assert!(parsed, "parse_env_file should succeed");

        let tier_slots = build_tier_slots(&vars);
        let model_priority_raw = vars.get("MODEL_PRIORITY").cloned();
        let mut warnings: Vec<String> = Vec::new();
        let priority_list = resolve_priority_list(
            model_priority_raw.as_deref(),
            &tier_slots,
            &mut warnings,
        );

        let snapshot = LocalLlmSnapshot {
            sources: vec![env_path.to_string_lossy().into_owned()],
            ollama_host: vars.get("OLLAMA_HOST").cloned(),
            data_model: Some("qwen3.6:27b-q4_K_M".to_string()),
            llm_mode: None,
            fast_model: Some("deepseek-coder:6.7b".to_string()),
            code_model: Some("qwen3.6:27b-q4_K_M".to_string()),
            heavy_model: None,
            think_model: Some("deepseek-r1:32b".to_string()),
            model_router: Some(true),
            fast_think: None,
            code_think: None,
            repo_local_llm_root: None,
            tier_slots,
            priority_list,
            model_priority_raw,
            warnings,
            prefer_warm: None,
            backend: "ollama".to_string(),
        };

        let json_str = serde_json::to_string_pretty(&snapshot)
            .expect("snapshot should serialize to JSON");
        let json: serde_json::Value = serde_json::from_str(&json_str)
            .expect("JSON should re-parse");

        assert_eq!(json["backend"].as_str().unwrap(), "ollama");

        // tierSlots should have exactly 3 entries (one per tier, all slot 0)
        let tier_slots_json = json["tierSlots"].as_array()
            .expect("tierSlots should be an array");
        assert_eq!(tier_slots_json.len(), 3, "Legacy config should have 3 tier slots");
        for entry in tier_slots_json {
            assert_eq!(entry["slot"].as_u64().unwrap(), 0, "All legacy slots are 0");
        }

        // priorityList should follow default FAST→CODE→THINK ordering
        let priority_json = json["priorityList"].as_array()
            .expect("priorityList should be an array");
        assert_eq!(priority_json.len(), 3, "Default priority has 3 entries");
        assert_eq!(priority_json[0].as_str().unwrap(), "deepseek-coder:6.7b"); // FAST
        assert_eq!(priority_json[1].as_str().unwrap(), "qwen3.6:27b-q4_K_M"); // CODE
        assert_eq!(priority_json[2].as_str().unwrap(), "deepseek-r1:32b");     // THINK

        // modelPriorityRaw should be null (not set in env)
        assert!(json["modelPriorityRaw"].is_null(), "No MODEL_PRIORITY in legacy config");

        // No warnings
        let warnings_json = json["warnings"].as_array()
            .expect("warnings should be an array");
        assert!(warnings_json.is_empty(), "no warnings expected");

        // Backward-compat fields still populated
        assert_eq!(json["fastModel"].as_str().unwrap(), "deepseek-coder:6.7b");
        assert_eq!(json["codeModel"].as_str().unwrap(), "qwen3.6:27b-q4_K_M");
        assert_eq!(json["thinkModel"].as_str().unwrap(), "deepseek-r1:32b");

        // Cleanup
        let _ = std::fs::remove_file(&env_path);
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn validate_backend_accepts_allowed_names() {
        for name in ALLOWED_BACKENDS {
            if unsupported_backends_on_platform().contains(name) {
                assert!(
                    validate_backend(name).is_err(),
                    "{name} should be unsupported on this platform"
                );
            } else {
                assert_eq!(validate_backend(name).unwrap(), *name);
            }
        }
    }

    #[test]
    fn validate_backend_rejects_unknown_name() {
        assert!(validate_backend("not-a-backend").is_err());
        assert!(validate_backend("").is_err());
    }

    #[test]
    fn normalize_backend_falls_back_to_ollama() {
        assert_eq!(normalize_backend("bad-backend"), "ollama");
        if cfg!(target_os = "linux") {
            assert_eq!(normalize_backend("mlx-lm"), "ollama");
        }
    }

    #[test]
    fn read_persisted_active_backend_panics_on_invalid_json() {
        use std::panic;

        let dir = std::env::temp_dir().join("bv_test_backend_config_panic");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("config.json");
        std::fs::write(&path, "{not json").expect("write bad json");

        let result = panic::catch_unwind(|| {
            let _ = read_persisted_active_backend_at(&path);
        });
        assert!(result.is_err(), "malformed JSON should panic");

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn read_persisted_active_backend_panics_on_wrong_type() {
        use std::panic;

        let dir = std::env::temp_dir().join("bv_test_backend_config_type");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("config.json");
        std::fs::write(&path, r#"{"active_backend": 42}"#).expect("write config");

        let result = panic::catch_unwind(|| {
            let _ = read_persisted_active_backend_at(&path);
        });
        assert!(result.is_err(), "non-string active_backend should panic");

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn read_persisted_active_backend_reads_string() {
        let dir = std::env::temp_dir().join("bv_test_backend_config_ok");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("config.json");
        std::fs::write(&path, r#"{"active_backend": "vllm"}"#).expect("write config");

        let got = read_persisted_active_backend_at(&path);
        assert_eq!(got.as_deref(), Some("vllm"));

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir(&dir);
    }
}
