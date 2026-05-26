#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod git_ops;
mod local_llm_config;
mod local_llm_runtime;
mod resource_monitor;

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

struct AppState {
    serve_child: Mutex<Option<Child>>,
    api_port: Mutex<u16>,
    engine_logs: Arc<Mutex<Vec<String>>>,
}

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn python_candidate_exists(path: &Path) -> bool {
    path.is_file() && std::fs::metadata(path).map(|m| m.is_file()).unwrap_or(false)
}

/// Prefer project venv / explicit config over bare `python3` (often missing uvicorn).
fn resolve_python_executable(configured: &str) -> String {
    if !configured.trim().is_empty() {
        let p = PathBuf::from(configured.trim());
        if python_candidate_exists(&p) {
            return p.to_string_lossy().into_owned();
        }
    }
    if let Ok(env_py) = std::env::var("AIDER_VISION_PYTHON") {
        let p = PathBuf::from(env_py.trim());
        if python_candidate_exists(&p) {
            return p.to_string_lossy().into_owned();
        }
    }
    let root = project_root();
    for rel in [".venv/bin/python3", ".venv/bin/python"] {
        let p = root.join(rel);
        if python_candidate_exists(&p) {
            return p.to_string_lossy().into_owned();
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

/// Where the headless core is installed (shipped with the AV app). Not the user's git project.
fn resolve_app_engine(core_engine_path: &str) -> Result<PathBuf, String> {
    let mut tried: Vec<String> = Vec::new();

    for key in ["BRIGHT_VISION_ENGINE", "AIDER_VISION_ENGINE"] {
        if let Ok(env) = std::env::var(key) {
            let p = PathBuf::from(&env);
            tried.push(p.display().to_string());
            if vision_serve_script(&p).is_file() {
                return Ok(p);
            }
        }
    }

    let bundled = project_root().join(core_engine_path);
    tried.push(vision_serve_script(&bundled).display().to_string());
    if vision_serve_script(&bundled).is_file() {
        return Ok(bundled);
    }

    Err(format!(
        "Vision API server not found. Tried:\n  {}\n\nFrom the Bright Vision repo run: git submodule update --init && source activate.sh",
        tried.join("\n  ")
    ))
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

fn port_listening(port: u16) -> bool {
    use std::net::{SocketAddr, TcpStream};
    let addr: SocketAddr = format!("127.0.0.1:{}", port).parse().unwrap_or_else(|_| "127.0.0.1:0".parse().unwrap());
    TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok()
}

/// Best-effort: free the API port when a prior serve process outlived the app.
#[cfg(unix)]
fn kill_listeners_on_port(port: u16) {
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
                .args(["-TERM", pid])
                .output();
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
async fn llm_ping(
    ollama_host: String,
    model_tag: String,
    core_api_url: Option<String>,
) -> Result<local_llm_runtime::LlmPingResult, String> {
    local_llm_runtime::llm_ping(&ollama_host, &model_tag, core_api_url).await
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
) -> Result<String, String> {
    let mut guard = state.serve_child.lock().await;
    if let Some(ref mut child) = *guard {
        if child_still_running(child).await {
            let p = *state.api_port.lock().await;
            return Ok(format!("http://127.0.0.1:{}", p));
        }
        let _ = child.kill().await;
        *guard = None;
    }
    if port_listening(port) {
        kill_listeners_on_port(port);
        tokio::time::sleep(Duration::from_millis(350)).await;
    }

    let engine_root = resolve_app_engine(&core_engine_path)?;
    let workspace = normalize_project_workspace(&working_dir);
    if !workspace.is_dir() {
        return Err(format!(
            "Project workspace is not a directory: {}",
            workspace.display()
        ));
    }

    let script = vision_serve_script(&engine_root);
    let py = resolve_python_executable(&python_path);

    let mut cmd = Command::new(&py);
    cmd.arg(&script)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .current_dir(&engine_root)
        // Prefer submodule sources over an older pip-installed aider_vision_core.
        .env("PYTHONPATH", engine_pythonpath(&engine_root))
        .env("NO_COLOR", "1")
        .env("BRIGHT_VISION_HEADLESS", "1")
        .env("AIDER_VISION_HEADLESS", "1")
        .env("TQDM_DISABLE", "1");
    if !extra_params.trim().is_empty() {
        cmd.env("LITELLM_EXTRA_PARAMS", &extra_params);
    }
    if !ollama_api_base.trim().is_empty() {
        cmd.env("OLLAMA_API_BASE", ollama_api_base.trim());
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start Vision API: {e}"))?;
    if let Some(stdout) = child.stdout.take() {
        spawn_stdout_drain(stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_stderr_reader(stderr, state.engine_logs.clone(), app);
    }

    *guard = Some(child);
    *state.api_port.lock().await = port;
    let _ = workspace;
    Ok(format!("http://127.0.0.1:{}", port))
}

#[tauri::command]
async fn stop_core_api(state: State<'_, AppState>) -> Result<(), String> {
    let port = *state.api_port.lock().await;
    let mut guard = state.serve_child.lock().await;
    if let Some(mut child) = guard.take() {
        child.kill().await.map_err(|e| e.to_string())?;
        let _ = tokio::time::timeout(Duration::from_secs(5), child.wait()).await;
    }
    if port_listening(port) {
        kill_listeners_on_port(port);
    }
    Ok(())
}

#[tauri::command]
async fn drain_core_api_logs(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let mut guard = state.engine_logs.lock().await;
    let lines = std::mem::take(&mut *guard);
    Ok(lines)
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

fn engine_pythonpath(engine_root: &Path) -> String {
    format!(
        "{}{}",
        engine_root.display(),
        std::env::var("PYTHONPATH")
            .map(|p| format!(":{p}"))
            .unwrap_or_default()
    )
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
        .env("PYTHONPATH", engine_pythonpath(&engine_root))
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

fn is_image_ext(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTENSIONS.iter().any(|ext| ext.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

fn workspace_todos_path(working_dir: &str) -> PathBuf {
    normalize_project_workspace(working_dir)
        .join(".aider-vision")
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
        .join(".aider-vision")
        .join("specs")
        .join(todo_id)
}

/// Load requirements/design/tasks markdown from ``.aider-vision/specs/{id}/`` into todos.json.
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

/// Pick image/PDF files and copy into ``.aider-vision/attachments/``; returns workspace-relative paths.
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

    let attach_dir = workspace.join(".aider-vision").join("attachments");
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
            app.manage(AppState {
                serve_child: Mutex::new(None),
                api_port: Mutex::new(8741),
                engine_logs: Arc::new(Mutex::new(Vec::new())),
            });
            
            // Ensure core API process is terminated when the app quits to prevent port conflicts
            let app_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { .. } = event {
                        let app_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app_handle.state::<AppState>();
                            let mut guard = state.serve_child.lock().await;
                            if let Some(mut child) = guard.take() {
                                let _ = child.kill().await;
                            }
                        });
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_core_api,
            stop_core_api,
            drain_core_api_logs,
            default_workspace,
            default_python_path,
            detect_workspace,
            engine_install_path,
            query_engine_versions,
            read_local_llm_config,
            local_llm_status,
            ollama_models_snapshot,
            local_llm_start_plain,
            local_llm_refresh_keep_alive,
            local_llm_stop_plain,
            llm_ping,
            git_workspace_status,
            git_file_diff,
            git_recent_commits,
            git_commit_graph,
            git_commit_detail,
            git_stage_paths,
            pick_workspace_folder,
            pick_context_directory,
            complete_workspace_path,
            pick_and_stage_chat_images,
            read_workspace_todos,
            write_workspace_todos,
            import_todo_spec_files,
            estimate_paths_context_chars,
            resource_monitor::get_resource_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
