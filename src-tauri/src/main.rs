#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Child;
use tokio::sync::Mutex;

struct AppState {
    child: Mutex<Option<Child>>,
}

#[tauri::command]
async fn start_aider(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    binary: String,
    model: String,
    extra_params: String,
    working_dir: String,
    auto_approve_limit: i32,
) -> Result<(), String> {
    let mut child_guard = state.child.lock().await.map_err(|e| e.to_string())?;
    if child_guard.is_some() {
        return Err("Aider is already running".into());
    }

    let mut cmd = tokio::process::Command::new("sh");
    cmd.arg("-c");
    let mut cmd_str = format!(
        "LITELLM_EXTRA_PARAMS=\"{}\" {} --model {}",
        extra_params.replace("\"", "\\\""),
        binary,
        model
    );
    if auto_approve_limit > 0 {
        cmd_str.push_str(" --auto-approve");
    }
    cmd.arg(&cmd_str);
    cmd.current_dir(&working_dir);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    cmd.stdin(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    
    let stdout = child.stdout.take().ok_or("Failed to take stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to take stderr")?;
    
    *child_guard = Some(child);
    drop(child_guard);

    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle_clone.emit("aider-output", line);
        }
    });

    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle_clone.emit("aider-error", line);
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_aider(state: State<'_, AppState>) -> Result<(), String> {
    let mut child = {
        let mut guard = state.child.lock().await.map_err(|e| e.to_string())?;
        guard.take()
    };
    if let Some(mut c) = child {
        c.kill().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn send_to_aider(state: State<'_, AppState>, input: String) -> Result<(), String> {
    let mut guard = state.child.lock().await.map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        let stdin = child.stdin.as_mut().ok_or("Stdin not available")?;
        stdin.write_all(format!("{}\n", input).as_bytes()).await.map_err(|e| e.to_string())?;
    } else {
        return Err("Aider is not running".into());
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            app.manage(AppState {
                child: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![start_aider, stop_aider, send_to_aider])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
