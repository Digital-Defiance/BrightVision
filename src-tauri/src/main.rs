#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod git_ops;
mod workspace_editor;
mod local_llm_config;
mod local_llm_runtime;
mod ntfy_notify;
mod resource_monitor;
mod session_key;
mod lan_remote;
mod vision_message;

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde_json::Value;
use tauri::{Emitter, Manager, RunEvent, State};
use tauri_plugin_dialog::DialogExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

struct AppState {
    serve_child: Mutex<Option<Child>>,
    api_port: Mutex<u16>,
    engine_logs: Arc<Mutex<Vec<String>>>,
    lan_remote: Mutex<Option<lan_remote::LanRemoteHandle>>,
}

static INSTALL_ROOT: OnceLock<PathBuf> = OnceLock::new();

fn compile_time_project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn find_repo_root_from(start: &Path) -> Option<PathBuf> {
    let mut cur = start.to_path_buf();
    loop {
        if vision_serve_script(&cur).is_file() {
            return Some(cur);
        }
        if !cur.pop() {
            return None;
        }
    }
}

/// Resolve BrightVision install root at runtime (handles repo moves, e.g. /Users/... vs /Volumes/...).
fn detect_install_root() -> PathBuf {
    for key in ["BRIGHT_VISION_ROOT", "BV_ROOT"] {
        if let Ok(env) = std::env::var(key) {
            let root = PathBuf::from(env.trim());
            if vision_serve_script(&root).is_file() {
                return root;
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Ok(canonical) = std::fs::canonicalize(&exe) {
            if let Some(mut cur) = canonical.parent().map(|p| p.to_path_buf()) {
                loop {
                    if vision_serve_script(&cur).is_file() {
                        return cur;
                    }
                    if !cur.pop() {
                        break;
                    }
                }
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(root) = find_repo_root_from(&cwd) {
            return root;
        }
    }
    let compiled = compile_time_project_root();
    if vision_serve_script(&compiled).is_file() {
        return compiled;
    }
    compiled
}

fn project_root() -> PathBuf {
    INSTALL_ROOT
        .get()
        .cloned()
        .unwrap_or_else(detect_install_root)
}

fn python_candidate_exists(path: &Path) -> bool {
    path.is_file() && std::fs::metadata(path).map(|m| m.is_file()).unwrap_or(false)
}

/// Prefer project venv / explicit config over bare `python3` (often missing uvicorn).
fn resolve_python_executable(configured: &str) -> String {
    if !configured.trim().is_empty() {
        let p = PathBuf::from(configured.trim());
        if python_candidate_exists(&p) {
            let s = p.to_string_lossy().into_owned();
            if python_can_import_vision(&s) {
                return s;
            }
        }
    }
    let root = project_root();
    for rel in [".venv/bin/python3", ".venv/bin/python"] {
        let p = root.join(rel);
        if python_candidate_exists(&p) {
            let s = p.to_string_lossy().into_owned();
            if python_can_import_vision(&s) {
                return s;
            }
        }
    }
    "python3".to_string()
}

#[tauri::command]
fn default_python_path() -> String {
    resolve_python_executable("")
}

fn vision_serve_script(engine_root: &Path) -> PathBuf {
    engine_root.join("scripts/vision_serve.py")
}

/// When the open project is the BrightVision repo itself, run the engine from that tree.
fn resolve_engine_root(
    workspace: &Path,
    core_engine_path: &str,
    install_root: &Path,
) -> Result<PathBuf, String> {
    if vision_serve_script(workspace).is_file() {
        return Ok(workspace.to_path_buf());
    }
    resolve_app_engine_from(install_root, core_engine_path)
}

fn resolve_python_for_engine(engine_root: &Path, configured: &str) -> String {
    for rel in [".venv/bin/python3", ".venv/bin/python"] {
        let p = engine_root.join(rel);
        if python_candidate_exists(&p) {
            let s = p.to_string_lossy().into_owned();
            if python_can_import_vision(&s) {
                return s;
            }
        }
    }
    resolve_python_executable(configured)
}

fn vision_serve_command(engine_root: &Path, py: &str) -> Result<(PathBuf, Vec<String>), String> {
    let host_args = ["--host".to_string(), "127.0.0.1".to_string()];
    let script = vision_serve_script(engine_root);
    for rel in [".venv/bin/bright-vision-core-serve", "bin/bright-vision-core-serve"] {
        let bin = engine_root.join(rel);
        if bin.is_file() {
            return Ok((bin, host_args.to_vec()));
        }
    }
    if !script.is_file() {
        return Err(format!(
            "Vision API server not found under {} (no scripts/vision_serve.py or bright-vision-core-serve)",
            engine_root.display()
        ));
    }
    let mut args = vec![script.to_string_lossy().into_owned()];
    args.extend(host_args);
    Ok((PathBuf::from(py), args))
}

/// Where the headless core is installed (shipped with the AV app). Not the user's git project.
fn resolve_app_engine_from(install_root: &Path, core_engine_path: &str) -> Result<PathBuf, String> {
    let mut tried: Vec<String> = Vec::new();

    for key in ["BRIGHT_VISION_ENGINE"] {
        if let Ok(env) = std::env::var(key) {
            let p = PathBuf::from(&env);
            tried.push(p.display().to_string());
            if vision_serve_script(&p).is_file() {
                return Ok(p);
            }
        }
    }

    let trimmed = core_engine_path.trim();
    if (trimmed.starts_with('/') || trimmed.starts_with('\\')) && !trimmed.is_empty() {
        let abs = PathBuf::from(trimmed);
        tried.push(vision_serve_script(&abs).display().to_string());
        if vision_serve_script(&abs).is_file() {
            return Ok(abs);
        }
    }

    let rel = trimmed.trim_start_matches("./");
    let bundled = if rel.is_empty() || rel == "." {
        install_root.to_path_buf()
    } else {
        install_root.join(rel)
    };
    tried.push(vision_serve_script(&bundled).display().to_string());
    if vision_serve_script(&bundled).is_file() {
        return Ok(bundled);
    }

    Err(format!(
        "Vision API server not found. Tried:\n  {}\n\nSet Settings → Engine path to {} or run from the BrightVision repo with source activate.sh",
        tried.join("\n  "),
        install_root.display()
    ))
}

fn resolve_app_engine(core_engine_path: &str) -> Result<PathBuf, String> {
    resolve_app_engine_from(&project_root(), core_engine_path)
}

fn normalize_project_workspace(hint: &str) -> PathBuf {
    let trimmed = hint.trim();
    if trimmed.is_empty() || trimmed == "." {
        return project_root();
    }
    let mut p = PathBuf::from(trimmed);
    if p.ends_with("src-tauri") {
        if let Some(parent) = p.parent() {
            p = parent.to_path_buf();
        }
    }
    p
}

fn spawn_stdout_drain(stdout: tokio::process::ChildStdout) {
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while reader.next_line().await.ok().flatten().is_some() {}
    });
}

fn spawn_stderr_reader(
    stderr: tokio::process::ChildStderr,
    logs: Arc<Mutex<Vec<String>>>,
    app: tauri::AppHandle,
) {
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            {
                let mut guard = logs.lock().await;
                guard.push(line.clone());
                if guard.len() > 500 {
                    let excess = guard.len() - 500;
                    guard.drain(0..excess);
                }
            }
            let _ = app.emit("vision-error", line);
        }
    });
}

async fn child_still_running(child: &mut Child) -> bool {
    matches!(child.try_wait(), Ok(None))
}

fn python_can_import_vision(py: &str) -> bool {
    std::process::Command::new(py)
        .args([
            "-c",
            "import bright_vision_core, uvicorn, cecli; assert getattr(cecli, '__version__', None)",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn format_recent_engine_logs(lines: &[String]) -> String {
    if lines.is_empty() {
        return String::new();
    }
    format!("\n\nEngine log (last lines):\n{}", lines.join("\n"))
}

async fn vision_api_health_json(port: u16, bearer: Option<&str>) -> Option<serde_json::Value> {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
    {
        Ok(c) => c,
        Err(_) => return None,
    };
    let mut req = client.get(format!("http://127.0.0.1:{port}/health"));
    if let Some(token) = bearer.filter(|t| !t.trim().is_empty()) {
        req = req.header("Authorization", format!("Bearer {}", token.trim()));
    }
    let Ok(res) = req.send().await else {
        return None;
    };
    if !res.status().is_success() {
        return None;
    }
    res.json::<serde_json::Value>().await.ok()
}

async fn vision_api_health_ok(port: u16, bearer: Option<&str>) -> bool {
    vision_api_health_json(port, bearer)
        .await
        .and_then(|v| {
            v.get("status")
                .and_then(|s| s.as_str())
                .map(|s| s == "ok")
        })
        .unwrap_or(false)
}

/// True when the running Vision API includes /agent dead-end recovery (not a stale orphan on :8741).
async fn vision_api_has_agent_turn_features(port: u16, bearer: Option<&str>) -> bool {
    vision_api_health_json(port, bearer)
        .await
        .and_then(|v| {
            v.get("agent_turn_features")
                .and_then(|f| f.get("prose_shell_recovery"))
                .and_then(|b| b.as_bool())
        })
        .unwrap_or(false)
}

async fn kill_stale_vision_api_on_port(
    port: u16,
    guard: &mut tokio::sync::MutexGuard<'_, Option<Child>>,
) {
    if let Some(mut child) = guard.take() {
        let _ = child.kill().await;
        let _ = tokio::time::timeout(Duration::from_secs(5), child.wait()).await;
    }
    if port_listening(port) {
        kill_listeners_on_port(port);
        tokio::time::sleep(Duration::from_millis(350)).await;
    }
}

async fn wait_for_vision_api_ready(
    child: &mut Child,
    port: u16,
    logs: Arc<Mutex<Vec<String>>>,
    bearer: Option<&str>,
) -> Result<(), String> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(45);
    loop {
        if tokio::time::Instant::now() >= deadline {
            let guard = logs.lock().await;
            let tail: Vec<_> = guard.iter().rev().take(8).cloned().collect();
            let hint = format_recent_engine_logs(&tail.into_iter().rev().collect::<Vec<_>>());
            return Err(format!(
                "Vision API did not become healthy on 127.0.0.1:{port} within 45s.{hint}"
            ));
        }
        if !child_still_running(child).await {
            let guard = logs.lock().await;
            let tail: Vec<_> = guard.iter().rev().take(12).cloned().collect();
            let hint = format_recent_engine_logs(&tail.into_iter().rev().collect::<Vec<_>>());
            return Err(format!(
                "Vision API process exited before listening on :{port}. \
                 Another app may still be bound to :{port} (orphan listener). Use Terminal → Stop, quit the app, \
                 then run: lsof -ti :{port} | xargs kill -9. \
                 Also run `source activate.sh` from your active repo (e.g. /Volumes/Code/BrightVision).{hint}"
            ));
        }
        if port_listening(port)
            && vision_api_health_ok(port, bearer).await
        {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

fn port_listening(port: u16) -> bool {
    use std::net::{SocketAddr, TcpStream};
    let addr: SocketAddr = format!("127.0.0.1:{}", port).parse().unwrap_or_else(|_| "127.0.0.1:0".parse().unwrap());
    TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok()
}

/// Best-effort: free the API port when a prior serve process outlived the app.
#[cfg(unix)]
fn kill_listeners_on_port(port: u16) {
    for signal in ["-TERM", "-KILL"] {
        let Ok(output) = std::process::Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output()
        else {
            return;
        };
        if !output.status.success() {
            return;
        }
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let pid = line.trim();
            if !pid.is_empty() {
                let _ = std::process::Command::new("kill")
                    .args([signal, pid])
                    .output();
            }
        }
        std::thread::sleep(Duration::from_millis(250));
        if !port_listening(port) {
            return;
        }
    }
}

#[cfg(not(unix))]
fn kill_listeners_on_port(_port: u16) {}

#[tauri::command]
fn read_local_llm_config(local_llm_root: Option<String>) -> local_llm_config::LocalLlmSnapshot {
    local_llm_config::read_local_llm_config(local_llm_root)
}

#[tauri::command]
async fn local_llm_status(
    ollama_host: String,
    model_tag: String,
) -> Result<local_llm_runtime::LocalLlmRuntimeStatus, String> {
    local_llm_runtime::local_llm_status(&ollama_host, &model_tag).await
}

#[tauri::command]
async fn ollama_models_snapshot(
    ollama_host: String,
    model_tag: String,
) -> Result<local_llm_runtime::OllamaModelsSnapshot, String> {
    local_llm_runtime::ollama_models_snapshot(&ollama_host, &model_tag).await
}

#[tauri::command]
async fn local_llm_start_plain(
    ollama_host: String,
    model_tag: String,
) -> Result<local_llm_runtime::LocalLlmRuntimeStatus, String> {
    local_llm_runtime::local_llm_start_plain(&ollama_host, &model_tag).await
}

#[tauri::command]
async fn local_llm_refresh_keep_alive(
    ollama_host: String,
    model_tag: String,
) -> Result<Vec<String>, String> {
    local_llm_runtime::local_llm_refresh_keep_alive(&ollama_host, &model_tag).await
}

#[tauri::command]
async fn local_llm_stop_plain(
    ollama_host: String,
    model_tag: String,
    keep_ollama: bool,
) -> Result<Vec<String>, String> {
    local_llm_runtime::local_llm_stop_plain(&ollama_host, &model_tag, keep_ollama).await
}

#[tauri::command]
async fn local_llm_prepare_hopper(
    ollama_host: String,
    entries: Vec<local_llm_runtime::HopperPrepareEntry>,
) -> Result<Vec<String>, String> {
    local_llm_runtime::local_llm_prepare_hopper(&ollama_host, entries).await
}

#[tauri::command]
async fn ollama_ensure_model_loaded(
    ollama_host: String,
    model_tag: String,
    keep_alive_secs: i64,
) -> Result<local_llm_runtime::OllamaEnsureModelResult, String> {
    local_llm_runtime::ollama_ensure_model_loaded(&ollama_host, &model_tag, keep_alive_secs).await
}

#[tauri::command]
async fn llm_ping(
    ollama_host: String,
    model_tag: String,
    core_api_url: Option<String>,
) -> Result<local_llm_runtime::LlmPingResult, String> {
    local_llm_runtime::llm_ping(&ollama_host, &model_tag, core_api_url).await
}

#[tauri::command]
fn generate_vision_api_token() -> String {
    lan_remote::generate_vision_api_token()
}

#[tauri::command]
fn get_lan_host_addresses() -> Vec<String> {
    lan_remote::list_lan_ipv4_addresses()
}

#[tauri::command]
async fn start_lan_remote_proxy(
    state: State<'_, AppState>,
    token: String,
    core_port: Option<u16>,
    proxy_port: Option<u16>,
    device_name: Option<String>,
) -> Result<lan_remote::LanRemoteStatus, String> {
    let core = core_port.unwrap_or(*state.api_port.lock().await);
    let proxy = proxy_port.unwrap_or(lan_remote::DEFAULT_LAN_PROXY_PORT);
    let name = device_name.unwrap_or_else(|| "BrightVision".into());
    lan_remote::start_lan_remote(
        &state.lan_remote,
        token,
        core,
        proxy,
        name,
    )
    .await
}

#[tauri::command]
async fn stop_lan_remote_proxy(state: State<'_, AppState>) -> Result<(), String> {
    lan_remote::stop_lan_remote(&state.lan_remote).await;
    Ok(())
}

#[tauri::command]
async fn lan_remote_proxy_status(
    state: State<'_, AppState>,
) -> Result<lan_remote::LanRemoteStatus, String> {
    let core = *state.api_port.lock().await;
    Ok(lan_remote::lan_remote_status(&state.lan_remote, core).await)
}

#[tauri::command]
async fn start_core_api(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    working_dir: String,
    core_engine_path: String,
    python_path: String,
    extra_params: String,
    ollama_api_base: String,
    port: u16,
    session_encrypt: Option<bool>,
    api_token: Option<String>,
) -> Result<String, String> {
    let bearer_owned = api_token
        .as_ref()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    let bearer = bearer_owned.as_deref();

    let mut guard = state.serve_child.lock().await;
    let tracked_port = *state.api_port.lock().await;
    let listener_port = if port_listening(port) {
        port
    } else if port_listening(tracked_port) {
        tracked_port
    } else {
        port
    };

    if port_listening(listener_port) && vision_api_health_ok(listener_port, bearer).await {
        if vision_api_has_agent_turn_features(listener_port, bearer).await {
            if let Some(ref mut child) = *guard {
                if child_still_running(child).await {
                    return Ok(format!("http://localhost:{}", listener_port));
                }
            } else {
                return Ok(format!("http://localhost:{}", listener_port));
            }
        }
        {
            let mut log = state.engine_logs.lock().await;
            log.push(format!(
                "[vision-api] Replacing stale Vision API on :{listener_port} (missing agent_turn_features — run pip install -e . then Start)"
            ));
        }
        kill_stale_vision_api_on_port(listener_port, &mut guard).await;
    } else if let Some(ref mut child) = *guard {
        if child_still_running(child).await {
            let p = tracked_port;
            if port_listening(p) && vision_api_health_ok(p, bearer).await {
                return Ok(format!("http://localhost:{}", p));
            }
            // Stale serve child (crashed or not yet bound) — respawn below.
            let _ = child.kill().await;
            *guard = None;
        } else {
            let _ = child.kill().await;
            *guard = None;
        }
    }
    if port_listening(port) {
        kill_listeners_on_port(port);
        tokio::time::sleep(Duration::from_millis(350)).await;
        if port_listening(port) {
            return Err(format!(
                "Port {port} is still in use by another process. Quit other BrightVision instances, \
                 then run: lsof -ti :{port} | xargs kill -9"
            ));
        }
    }

    let workspace = normalize_project_workspace(&working_dir);
    if !workspace.is_dir() {
        return Err(format!(
            "Project workspace is not a directory: {}",
            workspace.display()
        ));
    }

    let install_root = detect_install_root();
    let engine_root = resolve_engine_root(&workspace, &core_engine_path, &install_root)?;
    let py = resolve_python_for_engine(&engine_root, &python_path);
    if !python_can_import_vision(&py) {
        return Err(format!(
            "Python at {} cannot import bright_vision_core (missing venv?). \
             From the repo run: source activate.sh — then set Settings → Python to {}/.venv/bin/python3 \
             or clear a stale path if the repo moved between /Users/... and /Volumes/....",
            py,
            engine_root.display()
        ));
    }

    let (program, serve_args) = vision_serve_command(&engine_root, &py)?;

    {
        let mut guard = state.engine_logs.lock().await;
        guard.push(format!(
            "[vision-api] program={} engine={} workspace={}",
            program.display(),
            engine_root.display(),
            workspace.display()
        ));
    }

    let mut cmd = Command::new(&program);
    cmd.args(&serve_args)
        .arg("--port")
        .arg(port.to_string())
        .current_dir(&engine_root)
        .env("PYTHONSAFEPATH", "1")
        .env("NO_COLOR", "1")
        .env("BRIGHT_VISION_HEADLESS", "1")
        .env("BRIGHT_VISION_ROOT", engine_root.as_os_str())
        .env("TQDM_DISABLE", "1");
    if !extra_params.trim().is_empty() {
        cmd.env("LITELLM_EXTRA_PARAMS", &extra_params);
    }
    if !ollama_api_base.trim().is_empty() {
        cmd.env("OLLAMA_API_BASE", ollama_api_base.trim());
    }
    if session_encrypt.unwrap_or(false) {
        let key_b64 = session_key::ensure_session_encryption_key()?;
        cmd.env("CECLI_SESSION_KEY", key_b64);
    }
    if let Some(token) = api_token {
        let trimmed = token.trim();
        if !trimmed.is_empty() {
            cmd.env("BRIGHT_VISION_TOKEN", trimmed);
        }
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start Vision API: {e}"))?;
    if let Some(stdout) = child.stdout.take() {
        spawn_stdout_drain(stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_stderr_reader(stderr, state.engine_logs.clone(), app.clone());
    }

    wait_for_vision_api_ready(&mut child, port, state.engine_logs.clone(), bearer).await?;
    *guard = Some(child);
    *state.api_port.lock().await = port;
    let _ = workspace;
    Ok(format!("http://localhost:{}", port))
}

async fn shutdown_vision_api(state: &AppState) {
    lan_remote::stop_lan_remote(&state.lan_remote).await;
    let port = *state.api_port.lock().await;
    let mut guard = state.serve_child.lock().await;
    if let Some(mut child) = guard.take() {
        let _ = child.kill().await;
        let _ = tokio::time::timeout(Duration::from_secs(5), child.wait()).await;
    }
    drop(guard);
    if port_listening(port) {
        kill_listeners_on_port(port);
    }
}

#[tauri::command]
async fn stop_core_api(state: State<'_, AppState>) -> Result<(), String> {
    shutdown_vision_api(state.inner()).await;
    Ok(())
}

#[tauri::command]
async fn drain_core_api_logs(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let mut guard = state.engine_logs.lock().await;
    let lines = std::mem::take(&mut *guard);
    Ok(lines)
}

#[derive(Serialize, Deserialize)]
struct CoreSessionInfoResponse {
    session_id: String,
    workspace: String,
    model: String,
    files_in_chat: Vec<String>,
}

#[derive(Serialize)]
struct VisionApiResponse {
    status: u16,
    body: Value,
}

async fn vision_api_request_json(
    method: reqwest::Method,
    base_url: &str,
    path: &str,
    bearer_token: Option<&str>,
    body: Option<Value>,
    timeout_secs: u64,
) -> Result<VisionApiResponse, String> {
    let base = base_url.trim().trim_end_matches('/');
    let path = path.trim_start_matches('/');
    let label = format!("{} /{path}", method);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{base}/{path}");
    let mut req = client.request(method, &url);
    if body.is_some() {
        req = req.header("Content-Type", "application/json");
    }
    if let Some(payload) = body {
        req = req.json(&payload);
    }
    if let Some(token) = bearer_token {
        let trimmed = token.trim();
        if !trimmed.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", trimmed));
        }
    }
    let res = req.send().await.map_err(|e| format!("{label}: {e}"))?;
    let status = res.status().as_u16();
    let text = res.text().await.unwrap_or_default();
    let body = if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&text).unwrap_or(Value::String(text))
    };
    Ok(VisionApiResponse { status, body })
}

/// Generic Vision HTTP for desktop UI (WebKit fetch to localhost often fails with "Load failed").
#[tauri::command]
async fn vision_api_fetch(
    method: String,
    base_url: String,
    path: String,
    bearer_token: Option<String>,
    body: Option<Value>,
) -> Result<VisionApiResponse, String> {
    let method = match method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PATCH" => reqwest::Method::PATCH,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        other => return Err(format!("unsupported HTTP method: {other}")),
    };
    vision_api_request_json(
        method,
        &base_url,
        &path,
        bearer_token.as_deref(),
        body,
        180,
    )
    .await
}

#[derive(Serialize)]
struct VisionApiBytesResponse {
    status: u16,
    body_base64: String,
    content_type: Option<String>,
}

/// Raw GET/POST body for desktop (e.g. session debug JSON) — avoids WebKit fetch blob failures.
#[tauri::command]
async fn vision_api_fetch_bytes(
    method: String,
    base_url: String,
    path: String,
    bearer_token: Option<String>,
) -> Result<VisionApiBytesResponse, String> {
    let method = match method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        other => return Err(format!("unsupported HTTP method for bytes fetch: {other}")),
    };
    let base = base_url.trim().trim_end_matches('/');
    let path = path.trim_start_matches('/');
    let label = format!("{method} /{path}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.request(method, format!("{base}/{path}"));
    if let Some(token) = bearer_token {
        let trimmed = token.trim();
        if !trimmed.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", trimmed));
        }
    }
    let res = req.send().await.map_err(|e| format!("{label}: {e}"))?;
    let status = res.status().as_u16();
    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let bytes = res.bytes().await.map_err(|e| format!("{label}: {e}"))?;
    Ok(VisionApiBytesResponse {
        status,
        body_base64: B64.encode(bytes),
        content_type,
    })
}

/// Generic POST for desktop UI (WebKit fetch to localhost often fails with "Load failed").
#[tauri::command]
async fn vision_api_post(
    base_url: String,
    path: String,
    bearer_token: Option<String>,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let res = vision_api_request_json(
        reqwest::Method::POST,
        &base_url,
        &path,
        bearer_token.as_deref(),
        Some(body),
        180,
    )
    .await?;
    if !(200..300).contains(&res.status) {
        return Err(format!("POST /{} {}: {}", path.trim_start_matches('/'), res.status, res.body));
    }
    Ok(res.body)
}

/// Create session via reqwest (WebKit fetch POST to localhost often fails with "Load failed").
#[tauri::command]
async fn create_vision_session(
    base_url: String,
    bearer_token: Option<String>,
    body: serde_json::Value,
) -> Result<CoreSessionInfoResponse, String> {
    let res = vision_api_request_json(
        reqwest::Method::POST,
        &base_url,
        "sessions",
        bearer_token.as_deref(),
        Some(body),
        180,
    )
    .await?;
    if !(200..300).contains(&res.status) {
        return Err(format!("POST /sessions {}: {}", res.status, res.body));
    }
    serde_json::from_value(res.body).map_err(|e| format!("POST /sessions: invalid session payload ({e})"))
}

#[derive(Serialize)]
struct EngineInstallInfo {
    install_root: String,
    default_python_path: String,
}

/// Canonical BrightVision install root + default Python (for Settings path hygiene).
#[tauri::command]
fn engine_install_info() -> EngineInstallInfo {
    let root = project_root();
    EngineInstallInfo {
        install_root: root.to_string_lossy().into_owned(),
        default_python_path: resolve_python_executable(""),
    }
}

/// Git project root the agent should work in (not where the engine is installed).
#[tauri::command]
fn detect_workspace(hint: Option<String>) -> String {
    let h = hint.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| ".".into());
    let p = normalize_project_workspace(&h);
    if p.is_dir() {
        return p.to_string_lossy().into_owned();
    }
    project_root().to_string_lossy().into_owned()
}

#[tauri::command]
fn engine_install_path(core_engine_path: String) -> Result<String, String> {
    resolve_app_engine(&core_engine_path).map(|p| p.to_string_lossy().into_owned())
}

#[derive(Serialize, Deserialize)]
struct EngineVersions {
    bright_vision_core: String,
    cecli: String,
}

/// Read package versions from the configured engine tree (no HTTP server required).
#[tauri::command]
fn query_engine_versions(
    core_engine_path: String,
    python_path: String,
) -> Result<EngineVersions, String> {
    let engine_root = resolve_app_engine(&core_engine_path)?;
    let py = resolve_python_executable(&python_path);
    let script = r#"
import json
out = {"bright_vision_core": "unknown", "cecli": "unknown"}
try:
    import bright_vision_core as bvc
    out["bright_vision_core"] = str(getattr(bvc, "__version__", "unknown"))
except Exception:
    pass
try:
    from cecli._version import version as cv
    out["cecli"] = str(cv)
except Exception:
    pass
print(json.dumps(out))
"#;
    let output = std::process::Command::new(&py)
        .arg("-c")
        .arg(script)
        .current_dir(&engine_root)
        .env("PYTHONSAFEPATH", "1")
        .output()
        .map_err(|e| format!("Failed to query engine versions: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Engine version query failed (exit {}): {}",
            output.status,
            stderr.trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: EngineVersions = serde_json::from_str(stdout.trim())
        .map_err(|e| format!("Invalid version JSON from engine: {e}"))?;
    Ok(parsed)
}

#[tauri::command]
fn default_workspace() -> String {
    detect_workspace(None)
}

#[derive(Serialize, Clone)]
struct GitFileEntry {
    path: String,
    /// Staged (index) status: M, A, D, R, etc.
    index: String,
    /// Worktree status
    worktree: String,
}

#[derive(Serialize)]
struct GitWorkspaceStatus {
    is_repo: bool,
    branch: Option<String>,
    ahead: u32,
    behind: u32,
    files: Vec<GitFileEntry>,
    error: Option<String>,
}

#[tauri::command]
fn git_workspace_status(working_dir: String) -> GitWorkspaceStatus {
    let workspace = normalize_project_workspace(&working_dir);
    let empty = GitWorkspaceStatus {
        is_repo: false,
        branch: None,
        ahead: 0,
        behind: 0,
        files: Vec::new(),
        error: None,
    };
    if !workspace.is_dir() {
        return GitWorkspaceStatus {
            error: Some(format!("Not a directory: {}", workspace.display())),
            ..empty
        };
    }
    if git_ops::run_git(&workspace, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return GitWorkspaceStatus {
            error: Some("Not a git repository".into()),
            ..empty
        };
    }
    let branch = git_ops::run_git(&workspace, &["branch", "--show-current"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let porcelain = match git_ops::run_git(
        &workspace,
        &["status", "--porcelain=v1", "-b", "--untracked-files=all"],
    ) {
        Ok(s) => s,
        Err(e) => {
            return GitWorkspaceStatus {
                is_repo: true,
                branch,
                error: Some(e),
                ..empty
            };
        }
    };
    let mut ahead = 0u32;
    let mut behind = 0u32;
    let mut files = Vec::new();
    for line in porcelain.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            if let Some(trailing) = rest.split(' ').nth(1) {
                for part in trailing.split(',') {
                    if let Some(n) = part.strip_prefix("ahead ") {
                        ahead = n.parse().unwrap_or(0);
                    } else if let Some(n) = part.strip_prefix("behind ") {
                        behind = n.parse().unwrap_or(0);
                    }
                }
            }
            continue;
        }
        if line.len() < 4 {
            continue;
        }
        let xy = &line[..2];
        let path_part = line[3..].trim();
        let path = if let Some((p, _)) = path_part.split_once(" -> ") {
            p.trim().to_string()
        } else {
            path_part.to_string()
        };
        let index = xy.chars().next().unwrap_or(' ').to_string();
        let worktree = xy.chars().nth(1).unwrap_or(' ').to_string();
        if index == " " && worktree == " " {
            continue;
        }
        files.push(GitFileEntry {
            path,
            index,
            worktree,
        });
    }
    GitWorkspaceStatus {
        is_repo: true,
        branch,
        ahead,
        behind,
        files,
        error: None,
    }
}

const MAX_GIT_DIFF_CHARS: usize = 48_000;
const MAX_GIT_COMMIT_DETAIL_CHARS: usize = 64_000;

#[derive(Serialize)]
struct GitFileDiff {
    text: String,
    truncated: bool,
}

fn truncate_git_text(mut text: String, max: usize) -> (String, bool) {
    if text.len() <= max {
        return (text, false);
    }
    let truncated: String = text.chars().take(max).collect();
    text = truncated;
    text.push_str("\n\n… output truncated …\n");
    (text, true)
}

fn synthetic_untracked_diff(workspace: &Path, path: &str) -> Result<String, String> {
    let full = workspace.join(path);
    if !full.is_file() {
        return Ok(format!("(untracked: {path})\n"));
    }
    let content = std::fs::read_to_string(&full).map_err(|e| e.to_string())?;
    let mut diff = format!("--- /dev/null\n+++ b/{path}\n");
    for (i, line) in content.lines().enumerate() {
        if i >= 400 {
            diff.push_str("… file truncated …\n");
            break;
        }
        diff.push('+');
        diff.push_str(line);
        diff.push('\n');
    }
    Ok(diff)
}

#[tauri::command]
fn git_file_diff(
    working_dir: String,
    path: String,
    index: String,
    worktree: String,
) -> GitFileDiff {
    let workspace = normalize_project_workspace(&working_dir);
    let empty = GitFileDiff {
        text: String::new(),
        truncated: false,
    };
    if !workspace.is_dir() {
        return GitFileDiff {
            text: format!("Not a directory: {}", workspace.display()),
            ..empty
        };
    }
    let untracked = index == "?" && worktree == "?";
    let raw = if untracked {
        git_ops::run_git(
            &workspace,
            &["diff", "--no-index", "--", "/dev/null", path.as_str()],
        )
        .or_else(|_| synthetic_untracked_diff(&workspace, &path))
    } else {
        let mut parts: Vec<String> = Vec::new();
        if let Ok(staged) = git_ops::run_git(&workspace, &["diff", "--cached", "--", path.as_str()]) {
            if !staged.trim().is_empty() {
                parts.push(format!("--- staged ---\n{staged}"));
            }
        }
        if let Ok(unstaged) = git_ops::run_git(&workspace, &["diff", "--", path.as_str()]) {
            if !unstaged.trim().is_empty() {
                parts.push(format!("--- unstaged ---\n{unstaged}"));
            }
        }
        if parts.is_empty() {
            git_ops::run_git(&workspace, &["diff", "HEAD", "--", path.as_str()])
        } else {
            Ok(parts.join("\n"))
        }
    };
    match raw {
        Ok(text) => {
            let (text, truncated) = truncate_git_text(text, MAX_GIT_DIFF_CHARS);
            GitFileDiff { text, truncated }
        }
        Err(e) => GitFileDiff {
            text: e,
            truncated: false,
        },
    }
}

#[derive(Serialize, Clone)]
struct GitCommitEntry {
    hash: String,
    short_hash: String,
    subject: String,
    author: String,
    timestamp: i64,
}

#[tauri::command]
fn git_recent_commits(working_dir: String, limit: Option<u32>) -> Result<Vec<GitCommitEntry>, String> {
    let workspace = normalize_project_workspace(&working_dir);
    if !workspace.is_dir() {
        return Err(format!("Not a directory: {}", workspace.display()));
    }
    let n = limit.unwrap_or(20).clamp(1, 50);
    let out = git_ops::run_git(
        &workspace,
        &[
            "log",
            &format!("-{n}"),
            "--format=%H\x1f%h\x1f%s\x1f%an\x1f%ct",
        ],
    )?;
    let mut commits = Vec::new();
    for line in out.lines() {
        let mut fields = line.split('\x1f');
        let Some(hash) = fields.next() else { continue };
        let Some(short_hash) = fields.next() else { continue };
        let Some(subject) = fields.next() else { continue };
        let Some(author) = fields.next() else { continue };
        let Some(ts) = fields.next() else { continue };
        let timestamp = ts.parse::<i64>().unwrap_or(0);
        commits.push(GitCommitEntry {
            hash: hash.to_string(),
            short_hash: short_hash.to_string(),
            subject: subject.to_string(),
            author: author.to_string(),
            timestamp,
        });
    }
    Ok(commits)
}

#[derive(Serialize)]
struct GitCommitDetail {
    text: String,
    truncated: bool,
}

#[tauri::command]
fn git_commit_detail(working_dir: String, hash: String) -> Result<GitCommitDetail, String> {
    if hash.len() < 7 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid commit hash".into());
    }
    let workspace = normalize_project_workspace(&working_dir);
    let out = git_ops::run_git(
        &workspace,
        &["show", "--stat", "--patch", "--no-color", &hash],
    )?;
    let (text, truncated) = truncate_git_text(out, MAX_GIT_COMMIT_DETAIL_CHARS);
    Ok(GitCommitDetail { text, truncated })
}

#[tauri::command]
fn git_stage_paths(working_dir: String, paths: Option<Vec<String>>) -> Result<(), String> {
    let workspace = normalize_project_workspace(&working_dir);
    if !workspace.is_dir() {
        return Err(format!("Not a directory: {}", workspace.display()));
    }
    match paths {
        None => git_ops::run_git(&workspace, &["add", "-A"]).map(|_| ()),
        Some(list) if list.is_empty() => Err("No paths to stage".into()),
        Some(list) => {
            let mut args = vec!["add"];
            for p in &list {
                args.push(p.as_str());
            }
            git_ops::run_git(&workspace, &args).map(|_| ())
        }
    }
}

/// Discard worktree (and staged) changes for paths; remove untracked files/dirs.
#[tauri::command]
fn git_restore_worktree_paths(working_dir: String, paths: Vec<String>) -> Result<(), String> {
    let workspace = normalize_project_workspace(&working_dir);
    if !workspace.is_dir() {
        return Err(format!("Not a directory: {}", workspace.display()));
    }
    if paths.is_empty() {
        return Err("No paths to restore".into());
    }
    let status = git_workspace_status(working_dir.clone());
    let mut tracked: Vec<String> = Vec::new();
    let mut untracked: Vec<String> = Vec::new();
    for path in paths {
        let entry = status.files.iter().find(|f| f.path == path);
        if let Some(f) = entry {
            if f.index == "?" && f.worktree == "?" {
                untracked.push(path);
                continue;
            }
        }
        tracked.push(path);
    }
    if !tracked.is_empty() {
        let mut args = vec!["restore", "--source=HEAD", "--staged", "--worktree", "--"];
        for p in &tracked {
            args.push(p.as_str());
        }
        git_ops::run_git(&workspace, &args)?;
    }
    for path in untracked {
        let args = vec!["clean", "-fd", "--", path.as_str()];
        git_ops::run_git(&workspace, &args)?;
    }
    Ok(())
}

#[tauri::command]
fn git_commit_graph(
    working_dir: String,
    limit: Option<u32>,
) -> Result<Vec<git_ops::GitGraphNode>, String> {
    let workspace = normalize_project_workspace(&working_dir);
    git_ops::commit_graph(&workspace, limit.unwrap_or(20))
}

const MAX_CONTEXT_ESTIMATE_PER_FILE: u64 = 512 * 1024;

/// Rough context size for added paths (bytes capped per file; UI divides by ~4 for tokens).
#[tauri::command]
fn estimate_paths_context_chars(working_dir: String, paths: Vec<String>) -> Result<u64, String> {
    let workspace = normalize_project_workspace(&working_dir);
    if !workspace.is_dir() {
        return Err(format!("Not a directory: {}", workspace.display()));
    }
    let mut total: u64 = 0;
    for rel in paths {
        let p = rel.trim().replace('\\', "/");
        if p.is_empty() {
            continue;
        }
        let full = workspace.join(&p);
        if !full.starts_with(&workspace) {
            continue;
        }
        if full.is_file() {
            let len = std::fs::metadata(&full).map_err(|e| e.to_string())?.len();
            total = total.saturating_add(len.min(MAX_CONTEXT_ESTIMATE_PER_FILE));
        }
    }
    Ok(total)
}

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "bmp", "webp", "tiff", "pdf"];

/// Cecli project tree; BrightVision uses ``todos.json``, ``specs/``, ``attachments/`` subtrees.
const WORKSPACE_META_DIR: &str = ".cecli";

fn is_image_ext(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTENSIONS.iter().any(|ext| ext.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

fn workspace_todos_path(working_dir: &str) -> PathBuf {
    normalize_project_workspace(working_dir)
        .join(WORKSPACE_META_DIR)
        .join("todos.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChecklistItemJson {
    id: String,
    text: String,
    #[serde(default)]
    done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TodoItemJson {
    id: String,
    title: String,
    #[serde(default)]
    spec: String,
    #[serde(default)]
    requirements: String,
    #[serde(default)]
    design: String,
    #[serde(default)]
    tasks_md: String,
    #[serde(default)]
    depends_on: Vec<String>,
    #[serde(default)]
    branch: String,
    #[serde(default)]
    pr_url: String,
    #[serde(default = "default_todo_status")]
    status: String,
    #[serde(default)]
    links: Vec<String>,
    #[serde(default)]
    checklist: Vec<ChecklistItemJson>,
    created_at: String,
    updated_at: String,
}

fn default_todo_status() -> String {
    "open".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct TodoStoreJson {
    #[serde(default = "default_todo_version")]
    version: u32,
    #[serde(rename = "activeId", default)]
    active_id: Option<String>,
    #[serde(default)]
    todos: Vec<TodoItemJson>,
}

fn default_todo_version() -> u32 {
    1
}

#[tauri::command]
fn read_workspace_todos(working_dir: String) -> Result<TodoStoreJson, String> {
    let path = workspace_todos_path(&working_dir);
    if !path.is_file() {
        return Ok(TodoStoreJson::default());
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| format!("Invalid todos.json: {e}"))
}

#[tauri::command]
fn list_workspace_files_cmd(working_dir: String) -> Result<Vec<String>, String> {
    let workspace = normalize_project_workspace(&working_dir);
    workspace_editor::list_workspace_files(&workspace)
}

#[tauri::command]
fn read_workspace_text_file(working_dir: String, path: String) -> Result<String, String> {
    let workspace = normalize_project_workspace(&working_dir);
    workspace_editor::read_text_file(&workspace, &path)
}

#[tauri::command]
fn write_workspace_text_file(
    working_dir: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let workspace = normalize_project_workspace(&working_dir);
    workspace_editor::write_text_file(&workspace, &path, &content)
}

/// Write or append timing-stats CSV under the project workspace (path must stay inside workspace).
#[tauri::command]
fn write_timing_stats_csv(
    working_dir: String,
    file_path: String,
    content: String,
    append: bool,
    header_line: Option<String>,
) -> Result<(), String> {
    let workspace = normalize_project_workspace(&working_dir);
    if !workspace.is_dir() {
        return Err(format!("Not a directory: {}", workspace.display()));
    }
    let path = PathBuf::from(&file_path);
    let full = if path.is_absolute() {
        path
    } else {
        workspace.join(path)
    };
    let workspace_canon = workspace.canonicalize().map_err(|e| e.to_string())?;
    let full_canon = if full.exists() {
        full.canonicalize().map_err(|e| e.to_string())?
    } else {
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        full.clone()
    };
    if !full_canon.starts_with(&workspace_canon) {
        return Err("CSV path must be inside the project workspace".into());
    }

    let mut body = content;
    if append {
        let needs_header = !full.is_file()
            || std::fs::metadata(&full)
                .map(|m| m.len() == 0)
                .unwrap_or(true);
        if needs_header {
            if let Some(header) = header_line.filter(|h| !h.is_empty()) {
                body = format!("{header}\n{body}");
            }
        }
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&full)
            .map_err(|e| e.to_string())?;
        file.write_all(body.as_bytes()).map_err(|e| e.to_string())?;
    } else {
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&full, body).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn write_workspace_todos(working_dir: String, store: TodoStoreJson) -> Result<(), String> {
    let path = workspace_todos_path(&working_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(&store).map_err(|e| e.to_string())?;
    std::fs::write(&path, format!("{data}\n")).map_err(|e| e.to_string())
}

fn todo_specs_dir(working_dir: &str, todo_id: &str) -> PathBuf {
    normalize_project_workspace(working_dir)
        .join(WORKSPACE_META_DIR)
        .join("specs")
        .join(todo_id)
}

fn write_todo_spec_files(working_dir: &str, item: &TodoItemJson) -> Result<(), String> {
    let folder = todo_specs_dir(working_dir, &item.id);
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    std::fs::write(folder.join("requirements.md"), &item.requirements).map_err(|e| e.to_string())?;
    std::fs::write(folder.join("design.md"), &item.design).map_err(|e| e.to_string())?;
    std::fs::write(folder.join("tasks.md"), &item.tasks_md).map_err(|e| e.to_string())?;
    Ok(())
}

/// Remove ``.cecli/specs/{id}/`` for a deleted task.
#[tauri::command]
fn delete_todo_spec_folder(working_dir: String, todo_id: String) -> Result<(), String> {
    let folder = todo_specs_dir(&working_dir, &todo_id);
    if folder.is_dir() {
        std::fs::remove_dir_all(&folder).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Delete ``.cecli/specs/{id}/`` folders that are not in todos.json.
#[tauri::command]
fn prune_orphan_spec_folders(working_dir: String) -> Result<Vec<String>, String> {
    let store = read_workspace_todos(working_dir.clone())?;
    let known: std::collections::HashSet<&str> = store.todos.iter().map(|t| t.id.as_str()).collect();
    let specs_root = normalize_project_workspace(&working_dir)
        .join(WORKSPACE_META_DIR)
        .join("specs");
    let mut removed = Vec::new();
    if !specs_root.is_dir() {
        return Ok(removed);
    }
    let entries: Vec<_> = std::fs::read_dir(&specs_root)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();
    for entry in entries {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || known.contains(name.as_str()) {
            continue;
        }
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
        removed.push(name);
    }
    removed.sort();
    Ok(removed)
}

/// Write three-layer markdown from todos.json to ``.cecli/specs/{id}/``.
#[tauri::command]
fn export_todo_spec_files(working_dir: String, todo_id: String) -> Result<(), String> {
    let store = read_workspace_todos(working_dir.clone())?;
    let item = store
        .todos
        .iter()
        .find(|t| t.id == todo_id)
        .ok_or_else(|| format!("Unknown task: {todo_id}"))?;
    write_todo_spec_files(&working_dir, item)
}

/// Load requirements/design/tasks markdown from ``.cecli/specs/{id}/`` into todos.json.
#[tauri::command]
fn import_todo_spec_files(working_dir: String, todo_id: String) -> Result<TodoItemJson, String> {
    let folder = todo_specs_dir(&working_dir, &todo_id);
    if !folder.is_dir() {
        return Err(format!("No spec folder: {}", folder.display()));
    }
    let read_layer = |name: &str| -> Option<String> {
        let path = folder.join(name);
        if path.is_file() {
            std::fs::read_to_string(&path).ok()
        } else {
            None
        }
    };
    let requirements = read_layer("requirements.md").unwrap_or_default();
    let design = read_layer("design.md").unwrap_or_default();
    let tasks_md = read_layer("tasks.md").unwrap_or_default();
    if requirements.is_empty() && design.is_empty() && tasks_md.is_empty() {
        return Err("Spec folder has no requirements.md, design.md, or tasks.md".into());
    }
    let mut store = read_workspace_todos(working_dir.clone())?;
    let idx = store
        .todos
        .iter()
        .position(|t| t.id == todo_id)
        .ok_or_else(|| format!("Unknown task: {todo_id}"))?;
    let item = &mut store.todos[idx];
    if !requirements.is_empty() {
        item.requirements = requirements;
    }
    if !design.is_empty() {
        item.design = design;
    }
    if !tasks_md.is_empty() {
        item.tasks_md = tasks_md;
    }
    let out = item.clone();
    write_workspace_todos(working_dir, store)?;
    Ok(out)
}

/// Pick image/PDF files and copy into ``.cecli/attachments/``; returns workspace-relative paths.
#[tauri::command]
async fn pick_and_stage_chat_images(
    app: tauri::AppHandle,
    working_dir: String,
) -> Result<Vec<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Attach images for the model")
        .add_filter("Images & PDF", IMAGE_EXTENSIONS)
        .blocking_pick_files();

    let Some(paths) = picked else {
        return Ok(vec![]);
    };

    let workspace = normalize_project_workspace(&working_dir);
    if !workspace.is_dir() {
        return Err(format!("Not a directory: {}", workspace.display()));
    }

    let attach_dir = workspace.join(WORKSPACE_META_DIR).join("attachments");
    std::fs::create_dir_all(&attach_dir).map_err(|e| e.to_string())?;

    let mut rel_paths: Vec<String> = Vec::new();
    for file in paths {
        let src = PathBuf::from(file.to_string());
        if !src.is_file() {
            continue;
        }
        if !is_image_ext(&src) {
            continue;
        }
        let name = src
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "image.png".to_string());
        let mut dest = attach_dir.join(&name);
        let stem = dest.file_stem().and_then(|s| s.to_str()).unwrap_or("image").to_string();
        let ext = dest
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| format!(".{s}"))
            .unwrap_or_default();
        let mut n = 1;
        while dest.exists() {
            dest = attach_dir.join(format!("{stem}-{n}{ext}"));
            n += 1;
        }
        std::fs::copy(&src, &dest).map_err(|e| format!("Failed to copy {}: {e}", src.display()))?;
        let rel = dest
            .strip_prefix(&workspace)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        rel_paths.push(rel);
    }

    Ok(rel_paths)
}

/// Path completions relative to workspace (for `/add` / `/drop` in the chat input).
#[tauri::command]
fn complete_workspace_path(working_dir: String, prefix: String, limit: Option<usize>) -> Result<Vec<String>, String> {
    let limit = limit.unwrap_or(25).min(100);
    let workspace = normalize_project_workspace(&working_dir);
    if !workspace.is_dir() {
        return Err(format!("Not a directory: {}", workspace.display()));
    }

    let prefix = prefix.replace('\\', "/");
    let (browse_dir, fragment) = if let Some(idx) = prefix.rfind('/') {
        let dir_part = &prefix[..idx];
        let frag = prefix[idx + 1..].to_string();
        let dir = workspace.join(dir_part);
        (dir, frag)
    } else {
        (workspace.clone(), prefix)
    };

    let browse_dir = if browse_dir.is_dir() {
        browse_dir
    } else {
        workspace.clone()
    };

    let fragment_lower = fragment.to_lowercase();
    let mut matches: Vec<String> = Vec::new();

    let entries = std::fs::read_dir(&browse_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name == "." || name == ".." {
            continue;
        }
        if fragment.is_empty() && name.starts_with('.') {
            continue;
        }
        if !fragment.is_empty() && !name.to_lowercase().starts_with(&fragment_lower) {
            continue;
        }

        let rel = if browse_dir == workspace {
            name.clone()
        } else {
            let parent = browse_dir
                .strip_prefix(&workspace)
                .unwrap_or(&browse_dir)
                .to_string_lossy()
                .replace('\\', "/");
            if parent.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", parent.trim_end_matches('/'), name)
            }
        };

        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let mut out = rel.replace('\\', "/");
        if is_dir {
            out.push('/');
        }
        matches.push(out);
    }

    matches.sort();
    matches.dedup();
    matches.truncate(limit);
    Ok(matches)
}

#[tauri::command]
async fn pick_workspace_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app
        .dialog()
        .file()
        .set_title("Choose project to work on")
        .blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

/// Pick a folder under the workspace to add to the active session via `/add`-style context.
#[tauri::command]
async fn pick_context_directory(
    app: tauri::AppHandle,
    working_dir: String,
) -> Result<Option<String>, String> {
    let workspace = normalize_project_workspace(&working_dir);
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Add folder to chat context");
    if workspace.is_dir() {
        dialog = dialog.set_directory(workspace);
    }
    let picked = dialog.blocking_pick_folder();
    Ok(picked.map(|p| p.to_string()))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let install_root = detect_install_root();
            let _ = INSTALL_ROOT.set(install_root);
            app.manage(AppState {
                serve_child: Mutex::new(None),
                api_port: Mutex::new(8741),
                engine_logs: Arc::new(Mutex::new(Vec::new())),
                lan_remote: Mutex::new(None),
            });
            app.manage(vision_message::VisionMessageStreamState {
                cancel: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_core_api,
            create_vision_session,
            vision_api_post,
            vision_api_fetch,
            vision_api_fetch_bytes,
            vision_message::send_vision_message,
            vision_message::cancel_vision_message,
            session_key::ensure_session_encryption_key,
            session_key::clear_session_encryption_key,
            stop_core_api,
            drain_core_api_logs,
            default_workspace,
            default_python_path,
            engine_install_info,
            detect_workspace,
            engine_install_path,
            query_engine_versions,
            read_local_llm_config,
            local_llm_status,
            ollama_models_snapshot,
            local_llm_start_plain,
            local_llm_refresh_keep_alive,
            local_llm_stop_plain,
            local_llm_prepare_hopper,
            ollama_ensure_model_loaded,
            llm_ping,
            git_workspace_status,
            git_file_diff,
            git_recent_commits,
            git_commit_graph,
            git_commit_detail,
            git_stage_paths,
            git_restore_worktree_paths,
            pick_workspace_folder,
            pick_context_directory,
            complete_workspace_path,
            pick_and_stage_chat_images,
            read_workspace_todos,
            write_workspace_todos,
            write_timing_stats_csv,
            list_workspace_files_cmd,
            read_workspace_text_file,
            write_workspace_text_file,
            import_todo_spec_files,
            export_todo_spec_files,
            prune_orphan_spec_folders,
            delete_todo_spec_folder,
            estimate_paths_context_chars,
            resource_monitor::get_resource_snapshot,
            ntfy_notify::ntfy_send_push,
            generate_vision_api_token,
            get_lan_host_addresses,
            start_lan_remote_proxy,
            stop_lan_remote_proxy,
            lan_remote_proxy_status,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                let state = app_handle.state::<AppState>();
                tauri::async_runtime::block_on(shutdown_vision_api(state.inner()));
            }
        });
}
