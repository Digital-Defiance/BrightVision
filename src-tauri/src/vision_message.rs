//! Stream Vision API `POST /sessions/{id}/messages` SSE via reqwest (WebKit fetch fails on desktop).

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use futures_util::StreamExt;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::Mutex;

pub struct VisionMessageStreamState {
    pub cancel: Mutex<Option<Arc<AtomicBool>>>,
}

fn drain_sse_events(buffer: &mut String, out: &mut Vec<Value>) {
    while let Some(idx) = buffer.find("\n\n") {
        let part = buffer[..idx].to_string();
        *buffer = buffer[idx + 2..].to_string();
        for line in part.lines() {
            let data = line.strip_prefix("data: ").or_else(|| line.strip_prefix("data:"));
            if let Some(payload) = data {
                let trimmed = payload.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
                    if !v.is_null() && v.get("type").and_then(|t| t.as_str()).is_some() {
                        out.push(v);
                    }
                }
            }
        }
    }
}

#[tauri::command]
pub async fn send_vision_message(
    on_event: Channel<Value>,
    base_url: String,
    session_id: String,
    bearer_token: Option<String>,
    body: Value,
    stream_state: State<'_, VisionMessageStreamState>,
) -> Result<(), String> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut guard = stream_state.cancel.lock().await;
        *guard = Some(cancel.clone());
    }

    let result = async {
        let base = base_url.trim().trim_end_matches('/');
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(30))
            .timeout(std::time::Duration::from_secs(3600))
            .build()
            .map_err(|e| e.to_string())?;

        let mut req = client
            .post(format!("{base}/sessions/{session_id}/messages"))
            .header("Content-Type", "application/json")
            .json(&body);

        if let Some(token) = bearer_token {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                req = req.header("Authorization", format!("Bearer {}", trimmed));
            }
        }

        let res = req
            .send()
            .await
            .map_err(|e| format!("POST /sessions/{session_id}/messages: {e}"))?;

        let status = res.status();
        if !status.is_success() {
            let text = res.text().await.unwrap_or_default();
            return Err(format!(
                "POST /sessions/{session_id}/messages {}: {}",
                status.as_u16(),
                text
            ));
        }

        let mut stream = res.bytes_stream();
        let mut buffer = String::new();
        let mut pending = Vec::new();

        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            let chunk = chunk.map_err(|e| format!("SSE read: {e}"))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));
            drain_sse_events(&mut buffer, &mut pending);
            for event in pending.drain(..) {
                on_event
                    .send(event)
                    .map_err(|e| format!("channel send: {e}"))?;
            }
        }

        drain_sse_events(&mut buffer, &mut pending);
        for event in pending {
            on_event
                .send(event)
                .map_err(|e| format!("channel send: {e}"))?;
        }

        Ok(())
    }
    .await;

    {
        let mut guard = stream_state.cancel.lock().await;
        *guard = None;
    }

    result
}

#[tauri::command]
pub async fn cancel_vision_message(stream_state: State<'_, VisionMessageStreamState>) -> Result<(), String> {
    let guard = stream_state.cancel.lock().await;
    if let Some(cancel) = guard.as_ref() {
        cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}
