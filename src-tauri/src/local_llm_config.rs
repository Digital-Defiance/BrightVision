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
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmSnapshot {
    pub sources: Vec<String>,
    pub ollama_host: Option<String>,
    pub data_model: Option<String>,
    pub llm_mode: Option<String>,
    /// Resolved path when `{app_root}/local-llm` exists (symlink or directory).
    pub repo_local_llm_root: Option<String>,
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
        if !KEYS.contains(&key) {
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

fn resolve_chat_model(vars: &HashMap<String, String>) -> Option<String> {
    for key in ["LLM_MODEL", "DATA_MODEL", "CHAT_MODEL"] {
        if let Some(v) = vars.get(key).filter(|s| !s.trim().is_empty()) {
            return Some(v.trim().to_string());
        }
    }
    None
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
    paths.push(root.join("local-llm/local-llm.env"));
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

fn repo_local_llm_root() -> Option<String> {
    let p = app_root().join("local-llm");
    if p.is_dir() || p.is_symlink() {
        Some(display_path(&p))
    } else {
        None
    }
}

pub fn read_local_llm_config(hint_root: Option<String>) -> LocalLlmSnapshot {
    let mut vars: HashMap<String, String> = HashMap::new();
    let mut sources: Vec<String> = Vec::new();
    for path in config_file_paths(hint_root.as_deref()) {
        if parse_env_file(&path, &mut vars) {
            sources.push(display_path(&path));
        }
    }
    LocalLlmSnapshot {
        ollama_host: vars.get("OLLAMA_HOST").cloned(),
        data_model: resolve_chat_model(&vars),
        llm_mode: vars.get("LLM_MODE").cloned(),
        repo_local_llm_root: repo_local_llm_root(),
        sources,
    }
}
