#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, State, WindowEvent};
use tokio::process::{Child, Command};
use tokio::time::sleep;

const DEFAULT_ORCH_PORT: u16 = 8743;

struct OrchState {
    child: Mutex<Option<Child>>,
    engine_root: PathBuf,
    orch_port: u16,
    spawn_error: Mutex<Option<String>>,
}

impl OrchState {
    fn health_url(&self) -> String {
        format!("http://127.0.0.1:{}/health", self.orch_port)
    }

    fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.orch_port)
    }
}

fn resolve_orch_port() -> u16 {
    std::env::var("BV_TEST_ORCHESTRATOR_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_ORCH_PORT)
}

fn walk_to_repo_root(mut dir: PathBuf) -> Option<PathBuf> {
    for _ in 0..12 {
        if dir.join("bright_vision_core").is_dir() {
            return Some(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

fn resolve_engine_root() -> PathBuf {
    for key in ["BRIGHT_VISION_ENGINE", "BV_ROOT"] {
        if let Ok(env) = std::env::var(key) {
            let p = PathBuf::from(env);
            if p.join("bright_vision_core").is_dir() {
                return p;
            }
        }
    }
    let mut starts: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        starts.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            starts.push(parent.to_path_buf());
        }
    }
    for start in starts {
        if let Some(root) = walk_to_repo_root(start) {
            return root;
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn resolve_python(engine_root: &Path) -> PathBuf {
    let venv_py = engine_root.join(".venv/bin/python3");
    if venv_py.is_file() {
        return venv_py;
    }
    PathBuf::from("python3")
}

async fn fetch_orch_health(state: &OrchState) -> Option<serde_json::Value> {
    let Ok(resp) = reqwest::get(state.health_url()).await else {
        return None;
    };
    if !resp.status().is_success() {
        return None;
    }
    let Ok(text) = resp.text().await else {
        return None;
    };
    serde_json::from_str(&text).ok()
}

fn orch_api_compatible(body: &serde_json::Value) -> bool {
    body.get("service").and_then(|v| v.as_str()) == Some("test-suite")
        && body.get("runsEnabled").and_then(|v| v.as_bool()) == Some(true)
        && body.get("cancelActiveRoute").and_then(|v| v.as_bool()) == Some(true)
}

async fn orch_api_healthy(state: &OrchState) -> bool {
    fetch_orch_health(state)
        .await
        .map(|body| orch_api_compatible(&body))
        .unwrap_or(false)
}

#[cfg(unix)]
async fn free_orch_port(port: u16) {
    let script = format!(
        "pids=$(lsof -ti tcp:{port} 2>/dev/null); [ -n \"$pids\" ] && kill $pids 2>/dev/null; true"
    );
    let _ = Command::new("sh").arg("-c").arg(script).status().await;
    sleep(Duration::from_millis(400)).await;
}

#[cfg(not(unix))]
async fn free_orch_port(_port: u16) {}

async fn wait_for_orch_health(state: &OrchState, timeout: Duration) -> bool {
    let deadline = tokio::time::Instant::now() + timeout;
    while tokio::time::Instant::now() < deadline {
        if orch_api_healthy(state).await {
            return true;
        }
        sleep(Duration::from_millis(250)).await;
    }
    false
}

async fn log_orchestrator_stderr(mut stderr: tokio::process::ChildStderr) {
    use tokio::io::AsyncBufReadExt;
    let mut lines = tokio::io::BufReader::new(&mut stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        eprintln!("[orchestrator] {line}");
    }
}

async fn start_orchestrator(state: &OrchState) -> Result<(), String> {
    {
        let guard = state.child.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(());
        }
    }

    if let Some(body) = fetch_orch_health(state).await {
        if orch_api_compatible(&body) {
            eprintln!(
                "Test Lab: using existing orchestrator on :{}",
                state.orch_port
            );
            return Ok(());
        }
        eprintln!(
            "Test Lab: replacing stale orchestrator on :{} (restart after code update)",
            state.orch_port
        );
        free_orch_port(state.orch_port).await;
    }

    let port_s = state.orch_port.to_string();
    let python = resolve_python(&state.engine_root);
    let serve_bin = state
        .engine_root
        .join(".venv/bin/bright-vision-test-suite-serve");
    let mut cmd = if serve_bin.is_file() {
        let mut c = Command::new(&serve_bin);
        c.arg("--host").arg("127.0.0.1").arg("--port").arg(&port_s);
        c
    } else {
        let mut c = Command::new(&python);
        c.args([
            "-m",
            "bright_vision_core.test_suite.serve",
            "--host",
            "127.0.0.1",
            "--port",
            &port_s,
        ]);
        c
    };

    let mut child = cmd
        .current_dir(&state.engine_root)
        .env("BV_ROOT", state.engine_root.to_string_lossy().as_ref())
        .env(
            "BRIGHT_VISION_ENGINE",
            state.engine_root.to_string_lossy().as_ref(),
        )
        .env("BV_TEST_ORCHESTRATOR_PORT", &port_s)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("spawn orchestrator: {e}"))?;

    if let Some(stderr) = child.stderr.take() {
        tauri::async_runtime::spawn(log_orchestrator_stderr(stderr));
    }

    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    if !wait_for_orch_health(state, Duration::from_secs(45)).await {
        let hint = format!(
            "Orchestrator did not respond on :{} within 45s. \
             Run: source activate.sh && pip install -e . && yarn test-suite:serve",
            state.orch_port
        );
        if let Ok(mut err_guard) = state.spawn_error.lock() {
            *err_guard = Some(hint.clone());
        }
        return Err(hint);
    }

    eprintln!("Test Lab: orchestrator ready at {}", state.health_url());
    Ok(())
}

async fn stop_orchestrator(state: &OrchState) {
    let child = state
        .child
        .lock()
        .ok()
        .and_then(|mut guard| guard.take());
    if let Some(mut child) = child {
        let _ = child.kill().await;
    }
}

#[tauri::command]
fn get_suite_base_url(state: State<'_, OrchState>) -> String {
    state.base_url()
}

#[tauri::command]
fn get_orchestrator_port(state: State<'_, OrchState>) -> u16 {
    state.orch_port
}

#[tauri::command]
fn get_engine_root(state: State<'_, OrchState>) -> String {
    state.engine_root.display().to_string()
}

#[tauri::command]
fn get_orchestrator_error(state: State<'_, OrchState>) -> Option<String> {
    state.spawn_error.lock().ok().and_then(|g| g.clone())
}

#[tauri::command]
async fn restart_orchestrator(state: State<'_, OrchState>) -> Result<(), String> {
    stop_orchestrator(&state).await;
    free_orch_port(state.orch_port).await;
    sleep(Duration::from_millis(500)).await;
    if let Ok(mut err_guard) = state.spawn_error.lock() {
        *err_guard = None;
    }
    start_orchestrator(&state).await
}

fn main() {
    let engine_root = resolve_engine_root();
    let orch_port = resolve_orch_port();
    eprintln!(
        "Test Lab: engine root {}, orchestrator :{}",
        engine_root.display(),
        orch_port
    );

    tauri::Builder::default()
        .manage(OrchState {
            child: Mutex::new(None),
            engine_root: engine_root.clone(),
            orch_port,
            spawn_error: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_suite_base_url,
            get_orchestrator_port,
            get_engine_root,
            get_orchestrator_error,
            restart_orchestrator,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async {
                let state = handle.state::<OrchState>();
                if let Err(err) = start_orchestrator(&state).await {
                    eprintln!("Test Lab: {err}");
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = handle.state::<OrchState>();
                    stop_orchestrator(&state).await;
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error running Test Lab");
}
