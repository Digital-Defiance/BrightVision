//! Push notifications via [ntfy](https://ntfy.sh).

use reqwest::Client;
use std::time::Duration;

fn normalize_base(base: &str) -> Result<String, String> {
    let t = base.trim().trim_end_matches('/');
    if t.is_empty() {
        return Err("ntfy server URL is empty".into());
    }
    if !t.starts_with("http://") && !t.starts_with("https://") {
        return Err("ntfy server URL must start with http:// or https://".into());
    }
    Ok(t.to_string())
}

#[tauri::command]
pub async fn ntfy_send_push(
    server_base: String,
    topic: String,
    title: String,
    message: String,
    priority: Option<String>,
) -> Result<(), String> {
    let topic = topic.trim();
    if topic.is_empty() {
        return Err("ntfy topic is empty".into());
    }
    if topic.len() > 64 {
        return Err("ntfy topic is too long".into());
    }
    let base = normalize_base(&server_base)?;
    let url = format!("{}/{}", base, topic);
    let priority = priority.unwrap_or_else(|| "default".into());

    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    client
        .post(url)
        .header("Title", title.trim())
        .header("Tags", "robot")
        .header("Priority", priority.trim())
        .body(message)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    Ok(())
}
