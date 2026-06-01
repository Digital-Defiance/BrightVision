//! Push notifications via [ntfy](https://ntfy.sh) (Android / Wear OS bridge on phone).

use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NtfyPushRequest {
    pub server_base: String,
    pub topic: String,
    pub title: String,
    pub message: String,
    #[serde(default = "default_priority")]
    pub priority: String,
}

fn default_priority() -> String {
    "default".into()
}

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

pub async fn send_push(req: NtfyPushRequest) -> Result<(), String> {
    let topic = req.topic.trim();
    if topic.is_empty() {
        return Err("ntfy topic is empty".into());
    }
    if topic.len() > 64 {
        return Err("ntfy topic is too long".into());
    }
    let base = normalize_base(&req.server_base)?;
    let url = format!("{}/{}", base, topic);

    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    client
        .post(url)
        .header("Title", req.title.trim())
        .header("Tags", "robot")
        .header("Priority", req.priority.trim())
        .body(req.message)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn ntfy_send_push(
    server_base: String,
    topic: String,
    title: String,
    message: String,
    priority: Option<String>,
) -> Result<(), String> {
    send_push(NtfyPushRequest {
        server_base,
        topic,
        title,
        message,
        priority: priority.unwrap_or_else(default_priority),
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_base_rejects_empty() {
        assert!(normalize_base("  ").is_err());
    }

    #[test]
    fn normalize_base_strips_trailing_slash() {
        assert_eq!(
            normalize_base("https://ntfy.sh/").unwrap(),
            "https://ntfy.sh"
        );
    }
}
