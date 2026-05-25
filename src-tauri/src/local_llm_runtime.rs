//! Built-in Local LLM: Ollama up, pull chat model, preload with keep_alive=-1.

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
}

fn entry_to_row(entry: &serde_json::Value) -> Option<OllamaModelRow> {
    let name = model_label(entry)?;
    let size_raw = entry.get("size").and_then(|v| v.as_u64());
    let size = size_raw.filter(|&n| n > 0).map(format_bytes);
    let vram = entry
        .get("size_vram")
        .and_then(|v| v.as_u64())
        .filter(|&n| n > 0)
        .map(|n| format!("VRAM {}", format_bytes(n)));
    let expires_at = entry
        .get("expires_at")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    Some(OllamaModelRow {
        name,
        size,
        vram,
        expires_at,
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

    async fn fetch_tags_and_ps(&self) -> Result<(Vec<serde_json::Value>, Vec<serde_json::Value>), String> {
        let (tags, ps) = tokio::join!(self.fetch_tags_models(), self.fetch_ps_models());
        Ok((tags?, ps?))
    }

    async fn is_pulled(&self, model: &str) -> Result<bool, String> {
        let models = self.fetch_tags_models().await?;
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

    async fn preload_generate(&self, model: &str) -> Result<(), String> {
        let payload = serde_json::json!({
            "model": model,
            "keep_alive": -1,
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

    /// Extend `keep_alive: -1` without a full generate when the model is already in `/api/ps`.
    async fn touch_keep_alive(&self, model: &str) -> Result<(), String> {
        let payload = serde_json::json!({
            "model": model,
            "keep_alive": -1,
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

async fn pull_model(model: &str, logs: &mut Vec<String>) -> Result<(), String> {
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
    let host = normalize_ollama_host(ollama_host);
    let tag = model_tag.trim().to_string();
    let client = OllamaClient::new(&host)?;
    let reachable = client.is_running().await;
    if !reachable {
        return Ok(OllamaModelsSnapshot {
            ollama_host: host,
            reachable: false,
            configured_tag: tag,
            configured_in_ps: false,
            tags_text: "(Ollama not reachable — check host or run ollama serve)".to_string(),
            ps_text: "(Ollama not reachable)".to_string(),
            ps_rows: vec![],
            tags_rows: vec![],
        });
    }
    let tags_models = client.fetch_tags_models().await.unwrap_or_default();
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
    })
}

pub async fn local_llm_status(ollama_host: &str, model_tag: &str) -> Result<LocalLlmRuntimeStatus, String> {
    let host = normalize_ollama_host(ollama_host);
    let model = model_tag.trim().to_string();
    if model.is_empty() {
        return Err("model tag is empty".into());
    }
    let client = OllamaClient::new(&host)?;
    let running = client.is_running().await;
    let pulled = if running {
        client.is_pulled(&model).await.unwrap_or(false)
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
    let host = normalize_ollama_host(ollama_host);
    let model = model_tag.trim().to_string();
    if model.is_empty() {
        return Err("model tag is empty".into());
    }
    let mut logs = vec![format!("Local LLM (plain): {model} @ {host}")];
    let client = OllamaClient::new(&host)?;

    if !client.is_running().await {
        logs.push("Ollama not running — starting…".to_string());
        spawn_ollama_serve(&mut logs).await?;
        wait_for_ollama(&client, 30, &mut logs).await?;
    } else {
        logs.push("Ollama already running".to_string());
    }

    let (tags_models, ps_models) = client.fetch_tags_and_ps().await?;
    let mut pulled = OllamaClient::model_in_tags(&tags_models, &model);
    let mut loaded = OllamaClient::model_in_ps(&ps_models, &model);

    if !pulled {
        pull_model(&model, &mut logs).await?;
        pulled = true;
    } else {
        logs.push(format!("Model {model} already pulled"));
    }

    if loaded {
        logs.push(format!(
            "{model} already in /api/ps — skipping full preload (fast path)"
        ));
        logs.push(format!("Refreshing {model} keep_alive=-1…"));
        client.touch_keep_alive(&model).await?;
    } else {
        logs.push(format!("Loading {model} into RAM (keep_alive=-1)…"));
        client.preload_generate(&model).await?;
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

async fn ping_core_health(core_api_url: &str) -> (bool, Option<u64>) {
    let base = core_api_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return (false, None);
    }
    let client = match reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(_) => return (false, None),
    };
    let started = std::time::Instant::now();
    match client.get(format!("{base}/health")).send().await {
        Ok(res) if res.status().is_success() => (true, Some(started.elapsed().as_millis() as u64)),
        _ => (false, None),
    }
}

/// Layered ping: Ollama tags/ps + 1-token generate; optional Vision core `/health`.
pub async fn llm_ping(
    ollama_host: &str,
    model_tag: &str,
    core_api_url: Option<String>,
) -> Result<LlmPingResult, String> {
    let host = normalize_ollama_host(ollama_host);
    let model = model_tag.trim().to_string();
    if model.is_empty() {
        return Err("model tag is empty".into());
    }
    let mut logs = vec![format!("Ping {model} @ {host}")];
    let client = OllamaClient::new(&host)?;

    let ollama_reachable = client.is_running().await;
    logs.push(if ollama_reachable {
        "Ollama API reachable (/api/tags)".to_string()
    } else {
        "Ollama API not reachable".to_string()
    });

    let model_pulled = if ollama_reachable {
        client.is_pulled(&model).await.unwrap_or(false)
    } else {
        false
    };
    logs.push(if model_pulled {
        format!("Model {model} is pulled")
    } else {
        format!("Model {model} not in tags list")
    });

    let model_loaded = if ollama_reachable {
        client.is_loaded(&model).await.unwrap_or(false)
    } else {
        false
    };
    logs.push(if model_loaded {
        "Model loaded in memory (/api/ps)".to_string()
    } else {
        "Model not loaded (preload may be needed)".to_string()
    });

    let mut generate_ok = false;
    let mut latency_ms = None;
    let mut response_preview = None;
    let mut error = None;

    if ollama_reachable && model_pulled {
        logs.push("Running 1-token generate probe…".to_string());
        match client.ping_generate(&model).await {
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
        error = Some("Ollama is not running".into());
    } else {
        error = Some(format!("Model {model} is not pulled — run Start Local LLM"));
    }

    let (core_reachable, core_latency_ms) = match core_api_url {
        Some(ref url) if !url.trim().is_empty() => {
            logs.push(format!("Pinging core {url}…"));
            let (ok, ms) = ping_core_health(url).await;
            logs.push(if ok {
                format!(
                    "Core health OK{}",
                    ms.map(|m| format!(" in {m}ms")).unwrap_or_default()
                )
            } else {
                "Core health failed or timed out".to_string()
            });
            (Some(ok), ms)
        }
        _ => (None, None),
    };

    Ok(LlmPingResult {
        ollama_reachable,
        model_pulled,
        model_loaded,
        generate_ok,
        latency_ms,
        response_preview,
        core_reachable,
        core_latency_ms,
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
    let client = OllamaClient::new(&host)?;
    if !client.is_running().await {
        return Err("Ollama is not running".into());
    }
    let loaded = client.is_loaded(&model).await.unwrap_or(false);
    if loaded {
        client.touch_keep_alive(&model).await?;
        Ok(vec![format!("{model}: keep_alive=-1 refreshed (already in /api/ps)")])
    } else {
        client.preload_generate(&model).await?;
        Ok(vec![format!("{model}: loaded with keep_alive=-1")])
    }
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
