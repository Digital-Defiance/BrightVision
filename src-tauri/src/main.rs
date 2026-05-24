#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use serde::Serialize;
use tauri::{Emitter, Manager, State};
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

fn vision_serve_script(engine_root: &Path) -> PathBuf {
    engine_root.join("scripts/vision_serve.py")
}

/// Where the headless core is installed (shipped with the AV app). Not the user's git project.
fn resolve_app_engine(core_engine_path: &str) -> Result<PathBuf, String> {
    let mut tried: Vec<String> = Vec::new();

    if let Ok(env) = std::env::var("AIDER_VISION_ENGINE") {
        let p = PathBuf::from(&env);
        tried.push(p.display().to_string());
        if vision_serve_script(&p).is_file() {
            return Ok(p);
        }
    }

    let bundled = project_root().join(core_engine_path);
    tried.push(vision_serve_script(&bundled).display().to_string());
    if vision_serve_script(&bundled).is_file() {
        return Ok(bundled);
    }

    Err(format!(
        "Vision API server not found. Tried:\n  {}\n\nFrom the aider-vision repo run: git submodule update --init && source activate.sh",
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
            let _ = app.emit("aider-error", line);
        }
    });
}

#[tauri::command]
async fn start_core_api(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    working_dir: String,
    core_engine_path: String,
    python_path: String,
    extra_params: String,
    port: u16,
) -> Result<String, String> {
    let mut guard = state.serve_child.lock().await;
    if guard.is_some() {
        let p = *state.api_port.lock().await;
        return Ok(format!("http://127.0.0.1:{}", p));
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
    let py = if python_path.trim().is_empty() {
        "python3".to_string()
    } else {
        python_path
    };

    let mut cmd = Command::new(&py);
    cmd.arg(&script)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .current_dir(&engine_root)
        .env("PYTHONPATH", &engine_root)
        .env("NO_COLOR", "1")
        .env("AIDER_VISION_HEADLESS", "1");
    if !extra_params.trim().is_empty() {
        cmd.env("LITELLM_EXTRA_PARAMS", &extra_params);
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
    let mut guard = state.serve_child.lock().await;
    if let Some(mut child) = guard.take() {
        child.kill().await.map_err(|e| e.to_string())?;
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

fn run_git(workspace: &Path, args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(workspace)
        .args(args)
        .output()
        .map_err(|e| format!("git failed to run: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(stderr.trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
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
    if run_git(&workspace, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return GitWorkspaceStatus {
            error: Some("Not a git repository".into()),
            ..empty
        };
    }
    let branch = run_git(&workspace, &["branch", "--show-current"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let porcelain = match run_git(
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

#[tauri::command]
async fn pick_workspace_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app
        .dialog()
        .file()
        .set_title("Choose project to work on")
        .blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_core_api,
            stop_core_api,
            drain_core_api_logs,
            default_workspace,
            detect_workspace,
            engine_install_path,
            git_workspace_status,
            pick_workspace_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
