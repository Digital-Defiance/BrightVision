//! Built-in Local LLM: Ollama up, pull chat model, preload with keep_alive=-1.

use crate::local_llm_config;
use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::sleep;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmPingResult {
    pub ollama_reachable: bool,
    pub model_pulled: bool,
    pub model_loaded: bool,
    pub generate_ok: bool,
    pub latency_ms: Option<u64>,
    pub response_preview: Option<String>,
    pub core_reachable: Option<bool>,
    pub core_latency_ms: Option<u64>,
    /// Connect/HTTP detail when ``core_reachable`` is false.
    pub core_health_error: Option<String>,
    pub error: Option<String>,
    pub logs: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmRuntimeStatus {
    pub ollama_running: bool,
    pub model_pulled: bool,
    pub model_loaded: bool,
    pub ollama_host: String,
    pub model_tag: String,
    pub logs: Vec<String>,
}

/// One model row from Ollama `/api/tags` or `/api/ps`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelRow {
    pub name: String,
    pub size: Option<String>,
    pub vram: Option<String>,
    pub expires_at: Option<String>,
    pub processor: Option<String>,
    pub context: Option<u64>,
}

fn entry_to_row(entry: &serde_json::Value) -> Option<OllamaModelRow> {
    let name = model_label(entry)?;
    let size_raw = entry.get("size").and_then(|v| v.as_u64());
    let size = size_raw.filter(|&n| n > 0).map(format_bytes);
    let vram_raw = entry.get("size_vram").and_then(|v| v.as_u64());
    let vram = vram_raw
        .filter(|&n| n > 0)
        .map(|n| format!("VRAM {}", format_bytes(n)));
    let expires_at = entry
        .get("expires_at")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    // Processor: GPU offload percentage (matches `ollama ps` PROCESSOR column)
    let processor = match (size_raw, vram_raw) {
        (Some(s), Some(v)) if s > 0 => {
            let gpu_pct = ((v as f64 / s as f64) * 100.0).round() as u64;
            if gpu_pct >= 100 {
                Some("100% GPU".to_string())
            } else if gpu_pct == 0 {
                Some("100% CPU".to_string())
            } else {
                Some(format!("{}% GPU / {}% CPU", gpu_pct, 100 - gpu_pct))
            }
        }
        _ => None,
    };
    let context = entry.get("context_length").and_then(|v| v.as_u64());
    Some(OllamaModelRow {
        name,
        size,
        vram,
        expires_at,
        processor,
        context,
    })
}

fn rows_from_models(models: &[serde_json::Value]) -> Vec<OllamaModelRow> {
    let mut rows: Vec<OllamaModelRow> = models.iter().filter_map(entry_to_row).collect();
    rows.sort_by(|a, b| a.name.cmp(&b.name));
    rows
}

/// Human-readable `/api/tags` and `/api/ps` listings for Settings / Local LLM panel.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelsSnapshot {
    pub ollama_host: String,
    pub reachable: bool,
    pub configured_tag: String,
    pub configured_in_ps: bool,
    pub tags_text: String,
    pub ps_text: String,
    pub ps_rows: Vec<OllamaModelRow>,
    pub tags_rows: Vec<OllamaModelRow>,
    /// Active local LLM backend (`ollama`, `lmstudio`, …).
    pub backend: String,
}

/// Lifecycle operation routed through [`LlmBackendDispatcher`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LlmOperation {
    FetchTagsModels,
    PullModel,
    PreloadGenerate,
    TouchKeepAlive,
    PingGenerate,
}

/// Structured IPC error for unsupported backend operations (REQ-003.2).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsupportedOperationError {
    pub code: String,
    pub message: String,
}

impl UnsupportedOperationError {
    pub fn pull_model_not_ollama() -> Self {
        Self {
            code: "UNSUPPORTED_OPERATION".into(),
            message: "Model pulling is only supported for Ollama backends.".into(),
        }
    }

    fn into_ipc_string(self) -> String {
        serde_json::to_string(&self).unwrap_or(self.message)
    }
}

/// Routes model lifecycle calls based on the active backend from config.
pub struct LlmBackendDispatcher {
    backend: String,
}

impl LlmBackendDispatcher {
    pub fn new(backend: &str) -> Self {
        Self {
            backend: backend.to_string(),
        }
    }

    pub fn from_config() -> Self {
        Self::new(&local_llm_config::active_backend(None))
    }

    pub fn backend(&self) -> &str {
        &self.backend
    }

    pub fn supports_operation(&self, op: LlmOperation) -> bool {
        match op {
            LlmOperation::FetchTagsModels => matches!(self.backend.as_str(), "ollama" | "lmstudio"),
            LlmOperation::PullModel => self.backend == "ollama",
            LlmOperation::PreloadGenerate
            | LlmOperation::TouchKeepAlive
            | LlmOperation::PingGenerate => {
                matches!(self.backend.as_str(), "ollama" | "lmstudio")
            }
        }
    }

    async fn fetch_tags_models(
        &self,
        client: &OllamaClient,
    ) -> Result<Vec<serde_json::Value>, String> {
        if !self.supports_operation(LlmOperation::FetchTagsModels) {
            return Ok(vec![]);
        }
        if self.backend == "lmstudio" {
            return LmStudioCli::ls_llm().await;
        }
        client.fetch_tags_models().await
    }

    pub async fn pull_model(&self, model: &str, logs: &mut Vec<String>) -> Result<(), String> {
        if !self.supports_operation(LlmOperation::PullModel) {
            return Err(UnsupportedOperationError::pull_model_not_ollama().into_ipc_string());
        }
        pull_model_ollama(model, logs).await
    }

    async fn preload_generate(&self, client: &OllamaClient, model: &str) -> Result<(), String> {
        if !self.supports_operation(LlmOperation::PreloadGenerate) {
            return Ok(());
        }
        if self.backend == "lmstudio" {
            let key = strip_local_model_key(model);
            return LmStudioCli::load_with_options(
                &key,
                LmStudioLoadOptions::persistent(&key),
            )
            .await;
        }
        client.preload_generate(model).await
    }

    async fn touch_keep_alive(&self, client: &OllamaClient, model: &str) -> Result<(), String> {
        if !self.supports_operation(LlmOperation::TouchKeepAlive) {
            return Ok(());
        }
        if self.backend == "lmstudio" {
            return Ok(());
        }
        client.touch_keep_alive(model).await
    }

    async fn ping_generate(
        &self,
        client: &OllamaClient,
        model: &str,
        api_base: &str,
    ) -> Result<(u64, String), String> {
        if !self.supports_operation(LlmOperation::PingGenerate) {
            return Err("ping generate is only supported for Ollama and LM Studio backends".into());
        }
        if self.backend == "lmstudio" {
            return LmStudioCli::ping_openai(api_base, &strip_local_model_key(model)).await;
        }
        client.ping_generate(model).await
    }
}

fn format_bytes(n: u64) -> String {
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;
    const MB: f64 = 1024.0 * 1024.0;
    let x = n as f64;
    if x >= GB {
        format!("{:.1} GB", x / GB)
    } else if x >= MB {
        format!("{:.1} MB", x / MB)
    } else if x >= 1024.0 {
        format!("{:.1} KB", x / 1024.0)
    } else {
        format!("{n} B")
    }
}

fn model_label(entry: &serde_json::Value) -> Option<String> {
    entry
        .get("name")
        .and_then(|n| n.as_str())
        .or_else(|| entry.get("model").and_then(|n| n.as_str()))
        .map(|s| s.to_string())
}

fn name_matches_tag(name: &str, tag: &str) -> bool {
    name == tag || name.starts_with(&format!("{tag}:"))
}

fn entry_size_label(entry: &serde_json::Value) -> String {
    if let Some(vram) = entry.get("size_vram").and_then(|v| v.as_u64()) {
        if vram > 0 {
            return format!("VRAM {}", format_bytes(vram));
        }
    }
    if let Some(size) = entry.get("size").and_then(|v| v.as_u64()) {
        return format_bytes(size);
    }
    String::new()
}

pub fn normalize_ollama_host(host: &str) -> String {
    let h = host.trim();
    if h.is_empty() {
        "http://127.0.0.1:11434".to_string()
    } else {
        h.to_string()
    }
}

fn normalize_lmstudio_api_base(host: &str) -> String {
    let h = host.trim();
    if h.is_empty() {
        "http://127.0.0.1:1234".to_string()
    } else {
        h.to_string()
    }
}

fn strip_local_model_key(tag: &str) -> String {
    let t = tag.trim();
    for prefix in ["ollama_chat/", "ollama/", "openai/"] {
        if let Some(rest) = t.strip_prefix(prefix) {
            return rest.to_string();
        }
    }
    t.to_string()
}

fn lmstudio_model_key(entry: &serde_json::Value) -> Option<String> {
    entry
        .get("identifier")
        .or_else(|| entry.get("modelKey"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn lmstudio_entry_keys(entry: &serde_json::Value) -> Vec<String> {
    let mut keys = Vec::new();
    for field in ["identifier", "modelKey", "selectedVariant"] {
        if let Some(s) = entry.get(field).and_then(|v| v.as_str()) {
            let trimmed = s.trim();
            if !trimmed.is_empty() && !keys.iter().any(|k| k == trimmed) {
                keys.push(trimmed.to_string());
            }
        }
    }
    keys
}

fn lmstudio_ps_matches(entries: &[serde_json::Value], model: &str) -> bool {
    let key = strip_local_model_key(model);
    if key.is_empty() {
        return false;
    }
    entries.iter().any(|entry| {
        if entry.get("type").and_then(|v| v.as_str()) == Some("embedding") {
            return false;
        }
        lmstudio_entry_keys(entry).iter().any(|k| {
            k == &key
                || k.starts_with(&format!("{key}@"))
                || key.starts_with(&format!("{k}@"))
                || name_matches_tag(k, &key)
        }) || model_label(entry).is_some_and(|n| name_matches_tag(&n, &key))
    })
}

fn model_in_catalog(entries: &[serde_json::Value], model: &str) -> bool {
    let key = strip_local_model_key(model);
    entries.iter().any(|entry| {
        lmstudio_entry_keys(entry).iter().any(|k| k == &key || k.starts_with(&format!("{key}@")))
            || lmstudio_model_key(entry).is_some_and(|k| k == key || k.starts_with(&format!("{key}@")))
            || model_label(entry).is_some_and(|n| name_matches_tag(&n, &key))
    })
}

fn model_in_loaded(entries: &[serde_json::Value], model: &str) -> bool {
    lmstudio_ps_matches(entries, model)
}

struct LmStudioCli;

/// Options forwarded to ``lms load`` (see ``lms load --help``).
#[derive(Debug, Clone, Default)]
struct LmStudioLoadOptions {
    /// ``--ttl`` — unload after N seconds idle. Omitted when ``keep_alive`` is persistent (-1).
    ttl_secs: Option<u64>,
    /// ``--context-length``
    context_length: Option<u64>,
    /// ``--parallel``
    parallel: Option<u32>,
    /// ``--identifier`` — stable API id (defaults to model key).
    identifier: Option<String>,
}

impl LmStudioLoadOptions {
    fn from_keep_alive_secs(keep_alive_secs: i64) -> Self {
        let ttl_secs = (keep_alive_secs > 0).then_some(keep_alive_secs as u64);
        Self {
            ttl_secs,
            ..Self::from_env_defaults()
        }
    }

    fn persistent(model_key: &str) -> Self {
        Self {
            identifier: Some(model_key.to_string()),
            ..Self::from_env_defaults()
        }
    }

    fn from_env_defaults() -> Self {
        let context_length = std::env::var("BRIGHTVISION_LLM_LOAD_CONTEXT_LENGTH")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .filter(|&n| n > 0);
        let parallel = std::env::var("BRIGHTVISION_LLM_LOAD_PARALLEL")
            .ok()
            .and_then(|s| s.parse::<u32>().ok())
            .filter(|&n| n > 0);
        Self {
            ttl_secs: None,
            context_length,
            parallel,
            identifier: None,
        }
    }

    fn with_identifier(mut self, model_key: &str) -> Self {
        if self.identifier.is_none() {
            self.identifier = Some(model_key.to_string());
        }
        self
    }

    fn describe_flags(&self) -> String {
        let mut parts = vec!["-y".to_string()];
        if let Some(ttl) = self.ttl_secs {
            parts.push(format!("--ttl {ttl}"));
        }
        if let Some(ctx) = self.context_length {
            parts.push(format!("--context-length {ctx}"));
        }
        if let Some(par) = self.parallel {
            parts.push(format!("--parallel {par}"));
        }
        if let Some(id) = &self.identifier {
            parts.push(format!("--identifier {id}"));
        }
        parts.join(" ")
    }
}

impl LmStudioCli {
    async fn run_json(args: &[&str]) -> Result<Vec<serde_json::Value>, String> {
        let output = Command::new("lms")
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| format!("Failed to run lms {}: {e}", args.join(" ")))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "lms {} failed: {}",
                args.join(" "),
                stderr.trim()
            ));
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let trimmed = stdout.trim();
        if trimmed.is_empty() {
            return Ok(vec![]);
        }
        let parsed: serde_json::Value =
            serde_json::from_str(trimmed).map_err(|e| format!("lms JSON parse failed: {e}"))?;
        Ok(parsed
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|v| v.is_object())
            .collect())
    }

    async fn ls_llm() -> Result<Vec<serde_json::Value>, String> {
        let rows = Self::run_json(&["ls", "--json"]).await?;
        Ok(rows
            .into_iter()
            .filter(|row| row.get("type").and_then(|v| v.as_str()) == Some("llm"))
            .collect())
    }

    async fn ps() -> Result<Vec<serde_json::Value>, String> {
        let rows = Self::run_json(&["ps", "--json"]).await?;
        Ok(rows
            .into_iter()
            .filter(|row| row.get("type").and_then(|v| v.as_str()) != Some("embedding"))
            .collect())
    }

    async fn load_with_options(model_key: &str, opts: LmStudioLoadOptions) -> Result<(), String> {
        let key = model_key.trim();
        if key.is_empty() {
            return Err("model key is empty".into());
        }
        let opts = opts.with_identifier(key);
        let flags = opts.describe_flags();
        let mut cmd = Command::new("lms");
        cmd.arg("load").arg(key).arg("-y");
        if let Some(ttl) = opts.ttl_secs {
            cmd.arg("--ttl").arg(ttl.to_string());
        }
        if let Some(ctx) = opts.context_length {
            cmd.arg("--context-length").arg(ctx.to_string());
        }
        if let Some(par) = opts.parallel {
            cmd.arg("--parallel").arg(par.to_string());
        }
        if let Some(id) = opts.identifier.as_deref() {
            cmd.arg("--identifier").arg(id);
        }
        let output = cmd
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| format!("Failed to run lms load {key}: {e}"))?;
        if output.status.success() {
            Ok(())
        } else {
            Err(format!(
                "lms load {key} {flags} failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ))
        }
    }

    async fn unload_all() -> Result<(), String> {
        let output = Command::new("lms")
            .args(["unload", "--all"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| format!("Failed to run lms unload --all: {e}"))?;
        if output.status.success() {
            Ok(())
        } else {
            Err(format!(
                "lms unload --all failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ))
        }
    }

    fn row_from_ls(entry: &serde_json::Value) -> Option<OllamaModelRow> {
        let name = lmstudio_model_key(entry)?;
        let size = entry
            .get("sizeBytes")
            .and_then(|v| v.as_u64())
            .filter(|&n| n > 0)
            .map(format_bytes);
        let context = entry.get("maxContextLength").and_then(|v| v.as_u64());
        Some(OllamaModelRow {
            name,
            size,
            vram: None,
            expires_at: None,
            processor: entry
                .get("architecture")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            context,
        })
    }

    fn rows_from_ls(models: &[serde_json::Value]) -> Vec<OllamaModelRow> {
        let mut rows: Vec<OllamaModelRow> = models.iter().filter_map(Self::row_from_ls).collect();
        rows.sort_by(|a, b| a.name.cmp(&b.name));
        rows
    }

    fn row_from_ps(entry: &serde_json::Value) -> Option<OllamaModelRow> {
        let name = lmstudio_model_key(entry).or_else(|| model_label(entry))?;
        let size = entry
            .get("sizeBytes")
            .and_then(|v| v.as_u64())
            .filter(|&n| n > 0)
            .map(format_bytes);
        let context = entry
            .get("contextLength")
            .and_then(|v| v.as_u64())
            .or_else(|| entry.get("maxContextLength").and_then(|v| v.as_u64()));
        let mut processor_parts = Vec::new();
        if let Some(status) = entry.get("status").and_then(|v| v.as_str()) {
            if !status.is_empty() {
                processor_parts.push(status.to_uppercase());
            }
        }
        if let Some(parallel) = entry.get("parallel").and_then(|v| v.as_u64()) {
            if parallel > 0 {
                processor_parts.push(format!("parallel {parallel}"));
            }
        }
        if processor_parts.is_empty() {
            if let Some(arch) = entry.get("architecture").and_then(|v| v.as_str()) {
                processor_parts.push(arch.to_string());
            }
        }
        let expires_at = entry
            .get("selectedVariant")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .or_else(|| {
                entry
                    .get("ttlMs")
                    .and_then(|v| v.as_u64())
                    .map(|ms| format!("ttl {ms}ms"))
            });
        Some(OllamaModelRow {
            name,
            size,
            vram: entry
                .get("deviceIdentifier")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .or_else(|| Some("Local".to_string())),
            expires_at,
            processor: if processor_parts.is_empty() {
                None
            } else {
                Some(processor_parts.join(" · "))
            },
            context,
        })
    }

    fn rows_from_ps(models: &[serde_json::Value]) -> Vec<OllamaModelRow> {
        let mut rows: Vec<OllamaModelRow> = models.iter().filter_map(Self::row_from_ps).collect();
        rows.sort_by(|a, b| a.name.cmp(&b.name));
        rows
    }

    fn format_ls_list(models: &[serde_json::Value]) -> String {
        if models.is_empty() {
            return "(no models on disk — download in LM Studio or run lms get)".to_string();
        }
        let mut lines: Vec<String> = Vec::new();
        for entry in models {
            let Some(name) = lmstudio_model_key(entry) else {
                continue;
            };
            let mut extra = Vec::new();
            if let Some(size) = entry
                .get("sizeBytes")
                .and_then(|v| v.as_u64())
                .filter(|&n| n > 0)
            {
                extra.push(format_bytes(size));
            }
            if let Some(ctx) = entry.get("maxContextLength").and_then(|v| v.as_u64()) {
                extra.push(format!("ctx {ctx}"));
            }
            if entry.get("vision").and_then(|v| v.as_bool()) == Some(true) {
                extra.push("vision".into());
            }
            let suffix = if extra.is_empty() {
                String::new()
            } else {
                format!(" ({})", extra.join(", "))
            };
            lines.push(format!("  • {name}{suffix}"));
        }
        lines.sort();
        lines.join("\n")
    }

    fn format_ps_list(models: &[serde_json::Value]) -> String {
        if models.is_empty() {
            return "(none loaded in RAM — run lms load or Start Local LLM)".to_string();
        }
        let mut lines: Vec<String> = Vec::new();
        for entry in models {
            let Some(name) = lmstudio_model_key(entry).or_else(|| model_label(entry)) else {
                continue;
            };
            let mut extra = Vec::new();
            if let Some(status) = entry.get("status").and_then(|v| v.as_str()) {
                if !status.is_empty() {
                    extra.push(status.to_uppercase());
                }
            }
            if let Some(size) = entry
                .get("sizeBytes")
                .and_then(|v| v.as_u64())
                .filter(|&n| n > 0)
            {
                extra.push(format_bytes(size));
            }
            if let Some(ctx) = entry.get("contextLength").and_then(|v| v.as_u64()) {
                extra.push(format!("ctx {ctx}"));
            }
            if let Some(parallel) = entry.get("parallel").and_then(|v| v.as_u64()) {
                if parallel > 0 {
                    extra.push(format!("parallel {parallel}"));
                }
            }
            if let Some(variant) = entry.get("selectedVariant").and_then(|v| v.as_str()) {
                if !variant.is_empty() {
                    extra.push(variant.to_string());
                }
            }
            let suffix = if extra.is_empty() {
                String::new()
            } else {
                format!(" ({})", extra.join(", "))
            };
            lines.push(format!("  • {name}{suffix}"));
        }
        lines.sort();
        lines.join("\n")
    }

    async fn ping_openai(api_base: &str, model: &str) -> Result<(u64, String), String> {
        let base = normalize_lmstudio_api_base(api_base).trim_end_matches('/').to_string();
        let url = if base.ends_with("/v1") {
            format!("{base}/chat/completions")
        } else {
            format!("{base}/v1/chat/completions")
        };
        let started = std::time::Instant::now();
        let payload = serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
            "stream": false
        });
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?;
        let res = client
            .post(&url)
            .header("Authorization", "Bearer lm-studio")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("LM Studio chat probe failed: {e}"))?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("LM Studio chat probe: HTTP {status} {text}"));
        }
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let preview = body
            .pointer("/choices/0/message/content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .chars()
            .take(48)
            .collect::<String>();
        Ok((started.elapsed().as_millis() as u64, preview))
    }
}

struct OllamaClient {
    base: String,
    http: reqwest::Client,
}

impl OllamaClient {
    fn new(host: &str) -> Result<Self, String> {
        let base = normalize_ollama_host(host);
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self { base, http })
    }

    async fn is_running(&self) -> bool {
        self.http
            .get(format!("{}/api/tags", self.base))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    fn model_in_tags(models: &[serde_json::Value], model: &str) -> bool {
        let name = model.trim();
        models.iter().any(|entry| {
            entry
                .get("name")
                .and_then(|n| n.as_str())
                .map(|n| n == name || n.starts_with(&format!("{name}:")))
                .unwrap_or(false)
                || entry
                    .get("model")
                    .and_then(|n| n.as_str())
                    .is_some_and(|n| n == name)
        })
    }

    fn model_in_ps(models: &[serde_json::Value], model: &str) -> bool {
        let name = model.trim();
        models.iter().any(|entry| {
            model_label(entry).is_some_and(|n| name_matches_tag(&n, name))
        })
    }

    async fn fetch_tags_and_ps(
        &self,
        dispatcher: &LlmBackendDispatcher,
    ) -> Result<(Vec<serde_json::Value>, Vec<serde_json::Value>), String> {
        let (tags, ps) = tokio::join!(
            dispatcher.fetch_tags_models(self),
            self.fetch_ps_models()
        );
        Ok((tags?, ps?))
    }

    async fn is_pulled(
        &self,
        dispatcher: &LlmBackendDispatcher,
        model: &str,
    ) -> Result<bool, String> {
        let models = dispatcher.fetch_tags_models(self).await?;
        Ok(Self::model_in_tags(&models, model))
    }

    async fn is_loaded(&self, model: &str) -> Result<bool, String> {
        let models = self.fetch_ps_models().await?;
        Ok(Self::model_in_ps(&models, model))
    }

    async fn fetch_tags_models(&self) -> Result<Vec<serde_json::Value>, String> {
        let res = self
            .http
            .get(format!("{}/api/tags", self.base))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("tags: HTTP {}", res.status()));
        }
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        Ok(body
            .get("models")
            .and_then(|m| m.as_array())
            .cloned()
            .unwrap_or_default())
    }

    async fn fetch_ps_models(&self) -> Result<Vec<serde_json::Value>, String> {
        let res = self
            .http
            .get(format!("{}/api/ps", self.base))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Ok(vec![]);
        }
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        Ok(body
            .get("models")
            .and_then(|m| m.as_array())
            .cloned()
            .unwrap_or_default())
    }

    fn format_tags_list(models: &[serde_json::Value]) -> String {
        if models.is_empty() {
            return "(no models — run Start Local LLM or ollama pull)".to_string();
        }
        let mut lines: Vec<String> = Vec::new();
        for entry in models {
            let Some(name) = model_label(entry) else { continue };
            let size = entry_size_label(entry);
            let suffix = if size.is_empty() {
                String::new()
            } else {
                format!(" ({size})")
            };
            lines.push(format!("  • {name}{suffix}"));
        }
        lines.sort();
        lines.join("\n")
    }

    fn format_ps_list(models: &[serde_json::Value]) -> String {
        if models.is_empty() {
            return "(none loaded in RAM — /api/ps empty)".to_string();
        }
        let mut lines: Vec<String> = Vec::new();
        for entry in models {
            let Some(name) = model_label(entry) else { continue };
            let size = entry_size_label(entry);
            let mut extra = Vec::new();
            if !size.is_empty() {
                extra.push(size);
            }
            if let Some(exp) = entry.get("expires_at").and_then(|v| v.as_str()) {
                if !exp.is_empty() {
                    extra.push(format!("until {exp}"));
                }
            }
            let detail = if extra.is_empty() {
                String::new()
            } else {
                format!(" [{}]", extra.join(", "))
            };
            lines.push(format!("  • {name}{detail}"));
        }
        lines.sort();
        lines.join("\n")
    }

    /// Minimal non-streaming generate (1 token) to verify the model accepts inference.
    async fn ping_generate(&self, model: &str) -> Result<(u64, String), String> {
        let started = std::time::Instant::now();
        let payload = serde_json::json!({
            "model": model,
            "prompt": "ping",
            "stream": false,
            "keep_alive": -1,
            "options": { "num_predict": 1 }
        });
        let res = self
            .http
            .post(format!("{}/api/generate", self.base))
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("ping generate: HTTP {status} {text}"));
        }
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let preview = body
            .get("response")
            .and_then(|r| r.as_str())
            .unwrap_or("")
            .chars()
            .take(48)
            .collect::<String>();
        let ms = started.elapsed().as_millis() as u64;
        Ok((ms, preview))
    }

    async fn preload_generate_keep_alive(
        &self,
        model: &str,
        keep_alive: serde_json::Value,
    ) -> Result<(), String> {
        let payload = serde_json::json!({
            "model": model,
            "keep_alive": keep_alive,
            "prompt": " ",
            "stream": false
        });
        let res = self
            .http
            .post(format!("{}/api/generate", self.base))
            .json(&payload)
            .timeout(Duration::from_secs(600))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("preload generate: HTTP {status} {text}"));
        }
        Ok(())
    }

    async fn preload_generate(&self, model: &str) -> Result<(), String> {
        self.preload_generate_keep_alive(model, serde_json::json!(-1))
            .await
    }

    async fn unload_all_loaded(&self, ps_models: &[serde_json::Value]) -> Result<(), String> {
        for entry in ps_models {
            let Some(name) = model_label(entry) else { continue };
            let _ = self.unload_generate(&name).await;
        }
        Ok(())
    }

    async fn touch_keep_alive_value(
        &self,
        model: &str,
        keep_alive: serde_json::Value,
    ) -> Result<(), String> {
        let payload = serde_json::json!({
            "model": model,
            "keep_alive": keep_alive,
            "prompt": "",
            "stream": false,
            "options": { "num_predict": 0 }
        });
        let res = self
            .http
            .post(format!("{}/api/generate", self.base))
            .json(&payload)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("keep_alive touch: HTTP {status} {text}"));
        }
        Ok(())
    }

    /// Extend keep_alive without a full generate when the model is already in `/api/ps`.
    async fn touch_keep_alive(&self, model: &str) -> Result<(), String> {
        self.touch_keep_alive_value(model, serde_json::json!(-1)).await
    }

    async fn unload_generate(&self, model: &str) -> Result<(), String> {
        let payload = serde_json::json!({
            "model": model,
            "keep_alive": 0,
            "prompt": " ",
            "stream": false
        });
        let _ = self
            .http
            .post(format!("{}/api/generate", self.base))
            .json(&payload)
            .send()
            .await;
        Ok(())
    }
}

fn ollama_log_path() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ollama/logs/server.log")
}

async fn spawn_ollama_serve(logs: &mut Vec<String>) -> Result<(), String> {
    let log_path = ollama_log_path();
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let mut cmd = Command::new("ollama");
    cmd.arg("serve")
        .env("OLLAMA_KEEP_ALIVE", "-1")
        .env("OLLAMA_MAX_LOADED_MODELS", "1")
        .env("OLLAMA_CONTEXT_LENGTH", "32768")
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "macos")]
    cmd.env("OLLAMA_MLX", "1");

    cmd.spawn()
        .map_err(|e| format!("Failed to spawn ollama serve: {e}"))?;

    logs.push(format!(
        "Started ollama serve (logs: {})",
        log_path.display()
    ));
    Ok(())
}

async fn wait_for_ollama(client: &OllamaClient, max_secs: u64, logs: &mut Vec<String>) -> Result<(), String> {
    for i in 0..max_secs {
        if client.is_running().await {
            if i > 0 {
                logs.push("Ollama is running".to_string());
            }
            return Ok(());
        }
        sleep(Duration::from_secs(1)).await;
    }
    Err(format!(
        "Ollama did not respond within {max_secs}s (check {})",
        ollama_log_path().display()
    ))
}

async fn pull_model_ollama(model: &str, logs: &mut Vec<String>) -> Result<(), String> {
    logs.push(format!("Pulling {model}…"));
    let output = Command::new("ollama")
        .args(["pull", model])
        .output()
        .await
        .map_err(|e| format!("ollama pull failed to start: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ollama pull {model} failed: {stderr}"));
    }
    logs.push(format!("Pulled {model}"));
    Ok(())
}

pub async fn ollama_models_snapshot(
    ollama_host: &str,
    model_tag: &str,
) -> Result<OllamaModelsSnapshot, String> {
    let dispatcher = LlmBackendDispatcher::from_config();
    let tag = model_tag.trim().to_string();
    if dispatcher.backend() == "lmstudio" {
        let host = normalize_lmstudio_api_base(ollama_host);
        let reachable = LmStudioCli::run_json(&["ls", "--json"]).await.is_ok();
        if !reachable {
            return Ok(OllamaModelsSnapshot {
                ollama_host: host,
                reachable: false,
                configured_tag: tag,
                configured_in_ps: false,
                tags_text: "(LM Studio CLI not reachable — install lms and ensure it is on PATH)".to_string(),
                ps_text: "(loaded models managed via lms ps)".to_string(),
                ps_rows: vec![],
                tags_rows: vec![],
                backend: dispatcher.backend().to_string(),
            });
        }
        let tags_models = LmStudioCli::ls_llm().await.unwrap_or_default();
        let ps_models = LmStudioCli::ps().await.unwrap_or_default();
        let tags_rows = LmStudioCli::rows_from_ls(&tags_models);
        let ps_rows = LmStudioCli::rows_from_ps(&ps_models);
        let configured_in_ps = !tag.is_empty() && lmstudio_ps_matches(&ps_models, &tag);
        return Ok(OllamaModelsSnapshot {
            ollama_host: host,
            reachable: true,
            configured_tag: tag,
            configured_in_ps,
            tags_text: LmStudioCli::format_ls_list(&tags_models),
            ps_text: LmStudioCli::format_ps_list(&ps_models),
            ps_rows,
            tags_rows,
            backend: dispatcher.backend().to_string(),
        });
    }

    let host = normalize_ollama_host(ollama_host);
    let client = OllamaClient::new(&host)?;
    let reachable = if dispatcher.backend() == "ollama" {
        client.is_running().await
    } else {
        false
    };
    if !reachable {
        return Ok(OllamaModelsSnapshot {
            ollama_host: host,
            reachable: false,
            configured_tag: tag,
            configured_in_ps: false,
            tags_text: if dispatcher.backend() == "ollama" {
                "(Ollama not reachable — check host or run ollama serve)".to_string()
            } else {
                "(model listing managed externally for this backend)".to_string()
            },
            ps_text: if dispatcher.backend() == "ollama" {
                "(Ollama not reachable)".to_string()
            } else {
                "(VRAM / loaded models managed externally)".to_string()
            },
            ps_rows: vec![],
            tags_rows: vec![],
            backend: dispatcher.backend().to_string(),
        });
    }
    let tags_models = dispatcher.fetch_tags_models(&client).await.unwrap_or_default();
    let ps_models = client.fetch_ps_models().await.unwrap_or_default();
    let tags_rows = rows_from_models(&tags_models);
    let ps_rows = rows_from_models(&ps_models);
    let configured_in_ps = !tag.is_empty()
        && ps_rows.iter().any(|row| name_matches_tag(&row.name, &tag));
    Ok(OllamaModelsSnapshot {
        ollama_host: host.clone(),
        reachable: true,
        configured_tag: tag,
        configured_in_ps,
        tags_text: OllamaClient::format_tags_list(&tags_models),
        ps_text: OllamaClient::format_ps_list(&ps_models),
        ps_rows,
        tags_rows,
        backend: dispatcher.backend().to_string(),
    })
}

pub async fn local_llm_status(ollama_host: &str, model_tag: &str) -> Result<LocalLlmRuntimeStatus, String> {
    let model = model_tag.trim().to_string();
    if model.is_empty() {
        return Err("model tag is empty".into());
    }
    let dispatcher = LlmBackendDispatcher::from_config();
    if dispatcher.backend() == "lmstudio" {
        let host = normalize_lmstudio_api_base(ollama_host);
        let key = strip_local_model_key(&model);
        let running = LmStudioCli::run_json(&["ls", "--json"]).await.is_ok();
        let tags_models = LmStudioCli::ls_llm().await.unwrap_or_default();
        let ps_models = LmStudioCli::ps().await.unwrap_or_default();
        let pulled = running && model_in_catalog(&tags_models, &key);
        let loaded = running && model_in_loaded(&ps_models, &key);
        return Ok(LocalLlmRuntimeStatus {
            ollama_running: running,
            model_pulled: pulled,
            model_loaded: loaded,
            ollama_host: host,
            model_tag: key,
            logs: vec![],
        });
    }

    let host = normalize_ollama_host(ollama_host);
    let client = OllamaClient::new(&host)?;
    let running = if dispatcher.backend() == "ollama" {
        client.is_running().await
    } else {
        false
    };
    let pulled = if running {
        client.is_pulled(&dispatcher, &model).await.unwrap_or(false)
    } else {
        false
    };
    let loaded = if running {
        client.is_loaded(&model).await.unwrap_or(false)
    } else {
        false
    };
    Ok(LocalLlmRuntimeStatus {
        ollama_running: running,
        model_pulled: pulled,
        model_loaded: loaded,
        ollama_host: host,
        model_tag: model,
        logs: vec![],
    })
}

pub async fn local_llm_start_plain(
    ollama_host: &str,
    model_tag: &str,
) -> Result<LocalLlmRuntimeStatus, String> {
    let model = model_tag.trim().to_string();
    if model.is_empty() {
        return Err("model tag is empty".into());
    }
    let dispatcher = LlmBackendDispatcher::from_config();

    if dispatcher.backend() == "lmstudio" {
        let host = normalize_lmstudio_api_base(ollama_host);
        let key = strip_local_model_key(&model);
        let mut logs = vec![format!("Local LLM (LM Studio): {key} @ {host}")];
        let tags_models = LmStudioCli::ls_llm().await.unwrap_or_default();
        let ps_models = LmStudioCli::ps().await.unwrap_or_default();
        let pulled = model_in_catalog(&tags_models, &key);
        if !pulled {
            return Err(format!(
                "Model {key} not found on disk — download it in LM Studio or run: lms get {key}"
            ));
        }
        logs.push(format!("Model {key} available (lms ls)"));
        let loaded = model_in_loaded(&ps_models, &key);
        if loaded {
            logs.push(format!("{key} already loaded — skipping lms load (fast path)"));
        } else {
            let opts = LmStudioLoadOptions::persistent(&key);
            logs.push(format!("Loading {key} via lms load {}…", opts.describe_flags()));
            LmStudioCli::load_with_options(&key, opts).await?;
            logs.push(format!("{key} loaded into RAM"));
        }
        logs.push("Local LLM ready".to_string());
        return Ok(LocalLlmRuntimeStatus {
            ollama_running: true,
            model_pulled: true,
            model_loaded: true,
            ollama_host: host,
            model_tag: key,
            logs,
        });
    }

    let host = normalize_ollama_host(ollama_host);
    let mut logs = vec![format!("Local LLM (plain): {model} @ {host}")];
    let client = OllamaClient::new(&host)?;

    if dispatcher.backend() != "ollama" {
        return Err(UnsupportedOperationError::pull_model_not_ollama().into_ipc_string());
    }

    if !client.is_running().await {
        logs.push("Ollama not running — starting…".to_string());
        spawn_ollama_serve(&mut logs).await?;
        wait_for_ollama(&client, 30, &mut logs).await?;
    } else {
        logs.push("Ollama already running".to_string());
    }

    let (tags_models, ps_models) = client.fetch_tags_and_ps(&dispatcher).await?;
    let mut pulled = OllamaClient::model_in_tags(&tags_models, &model);
    let mut loaded = OllamaClient::model_in_ps(&ps_models, &model);

    if !pulled {
        dispatcher.pull_model(&model, &mut logs).await?;
        pulled = true;
    } else {
        logs.push(format!("Model {model} already pulled"));
    }

    if loaded {
        logs.push(format!(
            "{model} already in /api/ps — skipping preload and keep_alive refresh (fast path)"
        ));
        // Avoid queueing another /api/generate behind an in-flight load (session Start looked stuck at 10%).
    } else {
        logs.push(format!("Loading {model} into RAM (keep_alive=-1)…"));
        dispatcher.preload_generate(&client, &model).await?;
        loaded = client.is_loaded(&model).await.unwrap_or(true);
        if loaded {
            logs.push(format!("{model} in /api/ps (persistent load)"));
        } else {
            logs.push(format!("{model} preload sent (may appear in /api/ps shortly)"));
        }
    }

    logs.push("Local LLM ready".to_string());
    Ok(LocalLlmRuntimeStatus {
        ollama_running: true,
        model_pulled: pulled,
        model_loaded: loaded,
        ollama_host: host,
        model_tag: model,
        logs,
    })
}

async fn ping_core_health(core_api_url: &str) -> (bool, Option<u64>, Option<String>) {
    let base = core_api_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return (false, None, Some("core API URL is empty".into()));
    }
    let client = match reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(e) => return (false, None, Some(format!("HTTP client: {e}"))),
    };
    let started = std::time::Instant::now();
    let url = format!("{base}/health");
    match client.get(&url).send().await {
        Ok(res) if res.status().is_success() => {
            (true, Some(started.elapsed().as_millis() as u64), None)
        }
        Ok(res) => (
            false,
            None,
            Some(format!("GET {url} → HTTP {}", res.status())),
        ),
        Err(e) => (false, None, Some(format!("GET {url} failed: {e}"))),
    }
}

/// Layered ping: Ollama tags/ps + 1-token generate; optional Vision core `/health`.
pub async fn llm_ping(
    ollama_host: &str,
    model_tag: &str,
    core_api_url: Option<String>,
) -> Result<LlmPingResult, String> {
    let model = model_tag.trim().to_string();
    if model.is_empty() {
        return Err("model tag is empty".into());
    }
    let dispatcher = LlmBackendDispatcher::from_config();
    let api_base = if dispatcher.backend() == "lmstudio" {
        normalize_lmstudio_api_base(ollama_host)
    } else {
        normalize_ollama_host(ollama_host)
    };
    let mut logs = vec![format!("Ping {model} @ {api_base}")];
    let client = OllamaClient::new(&api_base)?;

    let ollama_reachable = if dispatcher.backend() == "ollama" {
        client.is_running().await
    } else if dispatcher.backend() == "lmstudio" {
        LmStudioCli::run_json(&["ls", "--json"]).await.is_ok()
    } else {
        false
    };
    logs.push(if dispatcher.backend() == "lmstudio" {
        if ollama_reachable {
            "LM Studio CLI reachable (lms ls --json)".to_string()
        } else {
            "LM Studio CLI not reachable — install lms".to_string()
        }
    } else if ollama_reachable {
        "Ollama API reachable (/api/tags)".to_string()
    } else {
        "Ollama API not reachable".to_string()
    });

    let model_pulled = if !ollama_reachable {
        false
    } else if dispatcher.backend() == "lmstudio" {
        LmStudioCli::ls_llm()
            .await
            .map(|tags| model_in_catalog(&tags, &model))
            .unwrap_or(false)
    } else {
        client.is_pulled(&dispatcher, &model).await.unwrap_or(false)
    };
    logs.push(if model_pulled {
        format!("Model {model} is pulled")
    } else {
        format!("Model {model} not in tags list")
    });

    let model_loaded = if !ollama_reachable {
        false
    } else if dispatcher.backend() == "lmstudio" {
        LmStudioCli::ps()
            .await
            .map(|ps| model_in_loaded(&ps, &model))
            .unwrap_or(false)
    } else {
        client.is_loaded(&model).await.unwrap_or(false)
    };
    logs.push(if model_loaded {
        if dispatcher.backend() == "lmstudio" {
            "Model loaded in memory (lms ps --json)".to_string()
        } else {
            "Model loaded in memory (/api/ps)".to_string()
        }
    } else {
        "Model not loaded (preload may be needed)".to_string()
    });

    let mut generate_ok = false;
    let mut latency_ms = None;
    let mut response_preview = None;
    let mut error = None;

    if ollama_reachable && model_pulled {
        logs.push("Running 1-token generate probe…".to_string());
        match dispatcher.ping_generate(&client, &model, &api_base).await {
            Ok((ms, preview)) => {
                generate_ok = true;
                latency_ms = Some(ms);
                response_preview = Some(preview.clone());
                logs.push(format!("Generate OK in {ms}ms — preview: {preview:?}"));
            }
            Err(e) => {
                error = Some(e.clone());
                logs.push(format!("Generate failed: {e}"));
            }
        }
    } else if !ollama_reachable {
        error = Some(if dispatcher.backend() == "lmstudio" {
            "LM Studio CLI is not available".into()
        } else {
            "Ollama is not running".into()
        });
    } else {
        error = Some(format!(
            "Model {model} is not on disk — download in LM Studio or run Start Local LLM"
        ));
    }

    let (core_reachable, core_latency_ms, core_health_error) = match core_api_url {
        Some(ref url) if !url.trim().is_empty() => {
            logs.push(format!("Pinging Vision API {url}…"));
            let (ok, ms, detail) = ping_core_health(url).await;
            logs.push(if ok {
                format!(
                    "Vision API health OK{}",
                    ms.map(|m| format!(" in {m}ms")).unwrap_or_default()
                )
            } else {
                format!(
                    "Vision API not reachable: {}",
                    detail.as_deref().unwrap_or("health check failed or timed out")
                )
            });
            (Some(ok), ms, detail)
        }
        _ => (None, None, None),
    };

    if generate_ok && core_reachable == Some(false) {
        let msg = core_health_error.clone().unwrap_or_else(|| {
            core_api_url
                .as_ref()
                .map(|u| format!("Vision API not listening on {u}"))
                .unwrap_or_else(|| "Vision API not running".into())
        });
        if error.is_none() {
            error = Some(msg);
        }
    }

    Ok(LlmPingResult {
        ollama_reachable,
        model_pulled,
        model_loaded,
        generate_ok,
        latency_ms,
        response_preview,
        core_reachable,
        core_latency_ms,
        core_health_error,
        error,
        logs,
    })
}

/// Re-apply `keep_alive: -1` without pull/spawn (fixes `ollama ps` TTL expiry).
pub async fn local_llm_refresh_keep_alive(
    ollama_host: &str,
    model_tag: &str,
) -> Result<Vec<String>, String> {
    let host = normalize_ollama_host(ollama_host);
    let model = model_tag.trim().to_string();
    if model.is_empty() {
        return Err("model tag is empty".into());
    }
    let dispatcher = LlmBackendDispatcher::from_config();
    let client = OllamaClient::new(&host)?;
    if dispatcher.backend() == "lmstudio" {
        let key = strip_local_model_key(&model);
        if LmStudioCli::run_json(&["ls", "--json"]).await.is_err() {
            return Err("LM Studio CLI is not available".into());
        }
        let ps_models = LmStudioCli::ps().await.unwrap_or_default();
        let loaded = model_in_loaded(&ps_models, &key);
        if loaded {
            return Ok(vec![format!("{key}: already loaded (lms ps)")]);
        }
        let opts = LmStudioLoadOptions::persistent(&key);
        LmStudioCli::load_with_options(&key, opts).await?;
        return Ok(vec![format!("{key}: loaded via lms load -y")]);
    }
    if dispatcher.backend() != "ollama" {
        return Err("keep_alive refresh is only supported for Ollama backends".into());
    }
    if !client.is_running().await {
        return Err("Ollama is not running".into());
    }
    let loaded = client.is_loaded(&model).await.unwrap_or(false);
    if loaded {
        dispatcher.touch_keep_alive(&client, &model).await?;
        return Ok(vec![format!("{model}: keep_alive=-1 refreshed (already in /api/ps)")]);
    }
    dispatcher.preload_generate(&client, &model).await?;
    Ok(vec![format!("{model}: loaded with keep_alive=-1")])
}

pub async fn local_llm_stop_plain(
    ollama_host: &str,
    model_tag: &str,
    keep_ollama: bool,
) -> Result<Vec<String>, String> {
    let host = normalize_ollama_host(ollama_host);
    let model = model_tag.trim().to_string();
    let mut logs = vec![format!("Stopping Local LLM ({model})")];
    let client = OllamaClient::new(&host)?;

    if client.is_running().await && !model.is_empty() {
        let _ = client.unload_generate(&model).await;
        logs.push(format!("Unloaded {model}"));
    }

    if keep_ollama {
        logs.push("Keeping Ollama running".to_string());
        return Ok(logs);
    }

    #[cfg(unix)]
    {
        let _ = Command::new("killall").arg("Ollama").output().await;
        let _ = Command::new("killall").arg("ollama").output().await;
        logs.push("Ollama stop requested".to_string());
    }
    #[cfg(not(unix))]
    {
        logs.push("Stop Ollama manually on this platform".to_string());
    }

    Ok(logs)
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct HopperPrepareEntry {
    pub model_tag: String,
    pub keep_alive_secs: i64,
    /// When true, load into RAM now (typically the default fast model only).
    pub preload: bool,
    /// Priority rank (0 = highest priority). When set, entries are processed in
    /// ascending rank order for pull and preload operations.
    pub priority_rank: Option<u32>,
}

/// Pull all hopper tags; preload the first entry marked `preload` in priority order (router warm-start).
///
/// When entries have `priority_rank` set, they are sorted by rank (lowest first = highest priority)
/// before iterating for pull and preload. This ensures higher-priority models are pulled first and
/// the first `preload: true` entry in priority order gets loaded into RAM.
pub async fn local_llm_prepare_hopper(
    ollama_host: &str,
    entries: Vec<HopperPrepareEntry>,
) -> Result<Vec<String>, String> {
    let host = normalize_ollama_host(ollama_host);
    let mut logs = vec!["Model hopper: preparing Ollama tags…".to_string()];
    if entries.is_empty() {
        logs.push("No hopper entries".to_string());
        return Ok(logs);
    }

    // Sort entries by priority_rank (ascending). Entries without a rank go last,
    // preserving their relative order among themselves (stable sort).
    let mut sorted_entries = entries;
    sorted_entries.sort_by_key(|e| e.priority_rank.unwrap_or(u32::MAX));

    let dispatcher = LlmBackendDispatcher::from_config();
    if dispatcher.backend() == "lmstudio" {
        logs[0] = "Model hopper: preparing LM Studio models…".to_string();
        let tags_models = LmStudioCli::ls_llm().await.unwrap_or_default();
        let ps_models = LmStudioCli::ps().await.unwrap_or_default();
        let mut preloaded: Option<String> = None;
        for entry in &sorted_entries {
            let tag = strip_local_model_key(entry.model_tag.trim());
            if tag.is_empty() {
                continue;
            }
            if !model_in_catalog(&tags_models, &tag) {
                logs.push(format!("{tag} not on disk — download in LM Studio first"));
                continue;
            }
            logs.push(format!("{tag} available (lms ls)"));
            if entry.preload && preloaded.is_none() {
                if model_in_loaded(&ps_models, &tag) {
                    logs.push(format!("{tag} already loaded — skipping hopper preload"));
                    preloaded = Some(tag);
                    continue;
                }
                logs.push(format!("Preloading {tag} via lms load {}…", {
                    let opts = LmStudioLoadOptions::from_keep_alive_secs(entry.keep_alive_secs)
                        .with_identifier(&tag);
                    opts.describe_flags()
                }));
                let opts = LmStudioLoadOptions::from_keep_alive_secs(entry.keep_alive_secs)
                    .with_identifier(&tag);
                LmStudioCli::load_with_options(&tag, opts).await?;
                preloaded = Some(tag);
            }
        }
        if preloaded.is_none() {
            logs.push("No preload flag set — models load on first route".to_string());
        }
        return Ok(logs);
    }

    if dispatcher.backend() != "ollama" {
        logs.push(format!(
            "Skipping hopper pull/preload — backend is {}",
            dispatcher.backend()
        ));
        return Ok(logs);
    }

    let client = OllamaClient::new(&host)?;
    if !client.is_running().await {
        spawn_ollama_serve(&mut logs).await?;
        wait_for_ollama(&client, 30, &mut logs).await?;
    }
    let (tags_models, ps_models) = client.fetch_tags_and_ps(&dispatcher).await?;
    let mut preloaded: Option<String> = None;
    for entry in &sorted_entries {
        let tag = entry.model_tag.trim();
        if tag.is_empty() {
            continue;
        }
        if !OllamaClient::model_in_tags(&tags_models, tag) {
            dispatcher.pull_model(tag, &mut logs).await?;
        } else {
            logs.push(format!("{tag} already pulled"));
        }
        if entry.preload && preloaded.is_none() {
            if OllamaClient::model_in_ps(&ps_models, tag) {
                logs.push(format!("{tag} already in /api/ps — skipping hopper preload"));
                preloaded = Some(tag.to_string());
                continue;
            }
            let ka = if entry.keep_alive_secs < 0 {
                serde_json::json!(-1)
            } else {
                serde_json::json!(entry.keep_alive_secs)
            };
            logs.push(format!("Preloading {tag} into RAM (keep_alive {ka:?})…"));
            client.preload_generate_keep_alive(tag, ka).await?;
            preloaded = Some(tag.to_string());
        }
    }
    if preloaded.is_none() {
        logs.push("No preload flag set — models load on first route".to_string());
    }
    Ok(logs)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct OllamaEnsureModelResult {
    pub logs: Vec<String>,
    pub load_ms: u64,
    pub swapped: bool,
}

/// Swap the single loaded Ollama model (OLLAMA_MAX_LOADED_MODELS=1) before a routed turn.
pub async fn ollama_ensure_model_loaded(
    ollama_host: &str,
    model_tag: &str,
    keep_alive_secs: i64,
) -> Result<OllamaEnsureModelResult, String> {
    let started = std::time::Instant::now();
    let host = normalize_ollama_host(ollama_host);
    let model = model_tag.trim().to_string();
    if model.is_empty() {
        return Err("model tag is empty".into());
    }
    let mut logs = vec![format!("Ensuring Ollama model {model}…")];
    let dispatcher = LlmBackendDispatcher::from_config();
    if dispatcher.backend() == "lmstudio" {
        let key = strip_local_model_key(&model);
        logs[0] = format!("Ensuring LM Studio model {key}…");
        let ps_models = LmStudioCli::ps().await.unwrap_or_default();
        let already = model_in_loaded(&ps_models, &key);
        let mut swapped = false;
        if !already {
            if !ps_models.is_empty() {
                LmStudioCli::unload_all().await?;
                swapped = true;
                logs.push("Unloaded previous LM Studio model(s) (lms unload --all)".to_string());
            }
            let opts = LmStudioLoadOptions::from_keep_alive_secs(keep_alive_secs)
                .with_identifier(&key);
            logs.push(format!(
                "Loading {key} via lms load {}…",
                opts.describe_flags()
            ));
            LmStudioCli::load_with_options(&key, opts).await?;
            logs.push(format!("Loaded {key} into RAM"));
        } else {
            logs.push(format!("{key} already loaded"));
        }
        let load_ms = started.elapsed().as_millis() as u64;
        return Ok(OllamaEnsureModelResult {
            logs,
            load_ms,
            swapped,
        });
    }

    let client = OllamaClient::new(&host)?;
    if dispatcher.backend() != "ollama" {
        return Err(UnsupportedOperationError::pull_model_not_ollama().into_ipc_string());
    }
    if !client.is_running().await {
        return Err("Ollama is not running".into());
    }
    let (tags, ps) = client.fetch_tags_and_ps(&dispatcher).await?;
    if !OllamaClient::model_in_tags(&tags, &model) {
        dispatcher.pull_model(&model, &mut logs).await?;
    }
    let already = OllamaClient::model_in_ps(&ps, &model);
    let mut swapped = false;
    if !already {
        client.unload_all_loaded(&ps).await?;
        swapped = !ps.is_empty();
        if swapped {
            logs.push("Unloaded previous model from RAM".to_string());
        }
    }
    let ka = if keep_alive_secs < 0 {
        serde_json::json!(-1)
    } else {
        serde_json::json!(keep_alive_secs)
    };
    if already {
        client.touch_keep_alive_value(&model, ka).await?;
        logs.push(format!("{model} already loaded — refreshed keep_alive"));
    } else {
        client.preload_generate_keep_alive(&model, ka).await?;
        logs.push(format!("Loaded {model} into RAM"));
    }
    let load_ms = started.elapsed().as_millis() as u64;
    Ok(OllamaEnsureModelResult {
        logs,
        load_ms,
        swapped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dispatcher_ollama_supports_lifecycle_ops() {
        let d = LlmBackendDispatcher::new("ollama");
        assert!(d.supports_operation(LlmOperation::FetchTagsModels));
        assert!(d.supports_operation(LlmOperation::PullModel));
        assert!(d.supports_operation(LlmOperation::PreloadGenerate));
        assert!(d.supports_operation(LlmOperation::TouchKeepAlive));
        assert!(d.supports_operation(LlmOperation::PingGenerate));
    }

    #[test]
    fn dispatcher_vllm_disables_ollama_only_ops() {
        let d = LlmBackendDispatcher::new("vllm");
        assert!(!d.supports_operation(LlmOperation::FetchTagsModels));
        assert!(!d.supports_operation(LlmOperation::PullModel));
        assert!(!d.supports_operation(LlmOperation::PreloadGenerate));
    }

    #[test]
    fn dispatcher_lmstudio_supports_list_and_preload() {
        let d = LlmBackendDispatcher::new("lmstudio");
        assert!(d.supports_operation(LlmOperation::FetchTagsModels));
        assert!(!d.supports_operation(LlmOperation::PullModel));
        assert!(d.supports_operation(LlmOperation::PreloadGenerate));
        assert!(d.supports_operation(LlmOperation::PingGenerate));
    }

    #[test]
    fn strip_local_model_key_strips_openai_prefix() {
        assert_eq!(
            strip_local_model_key("openai/qwen/qwen3.6-27b"),
            "qwen/qwen3.6-27b"
        );
    }

    #[test]
    fn lmstudio_load_options_maps_keep_alive_to_ttl() {
        let persistent = LmStudioLoadOptions::from_keep_alive_secs(-1);
        assert!(persistent.ttl_secs.is_none());
        let fast = LmStudioLoadOptions::from_keep_alive_secs(300);
        assert_eq!(fast.ttl_secs, Some(300));
        let opts = LmStudioLoadOptions::from_keep_alive_secs(300).with_identifier("qwen/qwen3.6-27b");
        assert!(opts.describe_flags().contains("-y"));
        assert!(opts.describe_flags().contains("--ttl 300"));
        assert!(opts.describe_flags().contains("--identifier qwen/qwen3.6-27b"));
    }

    #[test]
    fn lmstudio_row_from_ps_parses_status_and_context() {
        let entry: serde_json::Value = serde_json::json!({
            "type": "llm",
            "modelKey": "google/gemma-4-26b-a4b-qat",
            "identifier": "google/gemma-4-26b-a4b-qat",
            "sizeBytes": 15641332573_u64,
            "selectedVariant": "google/gemma-4-26b-a4b-qat@4bit",
            "status": "idle",
            "parallel": 4,
            "contextLength": 8192,
            "maxContextLength": 262144
        });
        let row = LmStudioCli::row_from_ps(&entry).expect("row");
        assert_eq!(row.name, "google/gemma-4-26b-a4b-qat");
        assert_eq!(row.context, Some(8192));
        assert_eq!(row.processor.as_deref(), Some("IDLE · parallel 4"));
        assert_eq!(
            row.expires_at.as_deref(),
            Some("google/gemma-4-26b-a4b-qat@4bit")
        );
        assert!(lmstudio_ps_matches(&[entry.clone()], "google/gemma-4-26b-a4b-qat"));
        assert!(lmstudio_ps_matches(
            &[entry],
            "openai/google/gemma-4-26b-a4b-qat"
        ));
    }

    #[test]
    fn unsupported_pull_error_serializes_structured_json() {
        let err = UnsupportedOperationError::pull_model_not_ollama();
        let json = serde_json::to_string(&err).expect("serialize");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
        assert_eq!(parsed["code"], "UNSUPPORTED_OPERATION");
        assert!(parsed["message"]
            .as_str()
            .unwrap()
            .contains("Ollama"));
    }

    #[tokio::test]
    async fn dispatcher_fetch_tags_returns_empty_for_vllm() {
        let d = LlmBackendDispatcher::new("vllm");
        let client = OllamaClient::new("http://127.0.0.1:11434").expect("client");
        let tags = d.fetch_tags_models(&client).await.expect("fetch");
        assert!(tags.is_empty());
    }

    #[tokio::test]
    async fn dispatcher_pull_model_returns_structured_error_for_vllm() {
        let d = LlmBackendDispatcher::new("vllm");
        let mut logs = Vec::new();
        let err = d.pull_model("qwen2.5:7b", &mut logs).await.unwrap_err();
        let parsed: serde_json::Value = serde_json::from_str(&err).expect("structured err");
        assert_eq!(parsed["code"], "UNSUPPORTED_OPERATION");
    }
}
