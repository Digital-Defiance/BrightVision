//! System CPU/RAM snapshot for the in-app resource overlay (roadmap #33).

use serde::Serialize;
use std::process::Command;
use sysinfo::System;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
    pub cpu_pct: f32,
    pub mem_used_mb: u64,
    pub mem_total_mb: u64,
    pub mem_pct: f32,
    /// Utilization 0–100 when detectable.
    pub gpu_pct: Option<f32>,
    /// How GPU was read: `nvidia-smi`, `macos-ioreg`, etc.
    pub gpu_source: Option<String>,
    pub scope: String,
}

fn clamp_pct(v: f32) -> Option<f32> {
    if v.is_finite() && (0.0..=100.0).contains(&v) {
        Some(v)
    } else {
        None
    }
}

/// Parse `"Device Utilization %"=93` style keys from `ioreg` IOAccelerator output.
pub fn parse_ioreg_performance_pct(blob: &str, key: &str) -> Option<f32> {
    for line in blob.lines() {
        if !line.contains(key) {
            continue;
        }
        let after_key = line.split(key).nth(1)?;
        let digits: String = after_key
            .chars()
            .skip_while(|c| !c.is_ascii_digit())
            .take_while(|c| c.is_ascii_digit() || *c == '.')
            .collect();
        if let Ok(v) = digits.parse::<f32>() {
            return clamp_pct(v);
        }
    }
    None
}

fn try_nvidia_gpu_utilization() -> Option<f32> {
    let out = Command::new("nvidia-smi")
        .args([
            "--query-gpu=utilization.gpu",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let line = String::from_utf8_lossy(&out.stdout);
    let first = line.lines().find(|l| !l.trim().is_empty())?;
    first.trim().parse().ok().and_then(clamp_pct)
}

#[cfg(target_os = "macos")]
fn try_macos_gpu_utilization() -> Option<(f32, &'static str)> {
    let out = Command::new("ioreg")
        .args(["-r", "-d", "1", "-w", "0", "-c", "IOAccelerator"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    // Apple Silicon AGX: same metric Activity Monitor uses (IOKit PerformanceStatistics).
    parse_ioreg_performance_pct(&text, "Device Utilization %")
        .map(|v| (v, "macos-ioreg"))
}

#[cfg(not(target_os = "macos"))]
fn try_macos_gpu_utilization() -> Option<(f32, &'static str)> {
    None
}

fn try_gpu_utilization() -> (Option<f32>, Option<String>) {
    if let Some(pct) = try_nvidia_gpu_utilization() {
        return (Some(pct), Some("nvidia-smi".into()));
    }
    if let Some((pct, src)) = try_macos_gpu_utilization() {
        return (Some(pct), Some(src.into()));
    }
    (None, None)
}

/// Refresh and return system-wide CPU/RAM (and best-effort GPU).
#[tauri::command]
pub fn get_resource_snapshot() -> ResourceSnapshot {
    let mut sys = System::new();
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_pct = sys.global_cpu_usage();
    let total = sys.total_memory();
    let used = sys.used_memory();
    let mem_pct = if total > 0 {
        (used as f64 / total as f64 * 100.0) as f32
    } else {
        0.0
    };

    let (gpu_pct, gpu_source) = try_gpu_utilization();

    ResourceSnapshot {
        cpu_pct,
        mem_used_mb: used / 1024 / 1024,
        mem_total_mb: total / 1024 / 1024,
        mem_pct,
        gpu_pct,
        gpu_source,
        scope: "system".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_ioreg_performance_pct;

    #[test]
    fn parses_device_utilization_from_ioreg_line() {
        let blob = r#""PerformanceStatistics" = {"Device Utilization %"=93,"Renderer Utilization %"=15}"#;
        assert_eq!(parse_ioreg_performance_pct(blob, "Device Utilization %"), Some(93.0));
    }
}
