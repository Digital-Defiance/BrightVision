//! LAN Link: HTTP proxy on LAN interface → loopback Vision API, with optional mDNS.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::body::{Body, Bytes};
use axum::extract::State;
use axum::http::{HeaderMap, Method, StatusCode, Uri};
use axum::response::Response;
use axum::routing::any;
use axum::Router;
use base64::engine::general_purpose::URL_SAFE;
use base64::Engine;
use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};

pub const DEFAULT_LAN_PROXY_PORT: u16 = 8742;
const MDNS_SERVICE_TYPE: &str = "_brightvision._tcp.local.";

pub struct LanRemoteHandle {
    proxy_port: u16,
    shutdown: tokio::sync::watch::Sender<bool>,
    server: tokio::task::JoinHandle<()>,
    mdns: Option<mdns_sd::ServiceDaemon>,
}

struct ProxyState {
    client: Client,
    upstream: String,
    token: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanRemoteStatus {
    pub running: bool,
    pub proxy_port: u16,
    pub core_port: u16,
    pub addresses: Vec<String>,
}

pub fn generate_vision_api_token() -> String {
    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf).expect("getrandom");
    URL_SAFE.encode(buf).trim_end_matches('=').to_string()
}

pub fn list_lan_ipv4_addresses() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            if iface.is_loopback() {
                continue;
            }
            if let if_addrs::IfAddr::V4(v4) = iface.addr {
                let ip = v4.ip;
                if !ip.is_loopback() && !ip.is_link_local() && !ip.is_broadcast() {
                    out.push(ip.to_string());
                }
            }
        }
    }
    out.sort();
    out.dedup();
    out
}

fn bearer_matches(headers: &HeaderMap, expected: &str) -> bool {
    let Some(auth) = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    else {
        return false;
    };
    let prefix = "Bearer ";
    if !auth.starts_with(prefix) {
        return false;
    }
    let provided = auth[prefix.len()..].trim();
    if provided.len() != expected.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in provided.bytes().zip(expected.bytes()) {
        diff |= a ^ b;
    }
    diff == 0
}

async fn proxy_route(
    State(st): State<Arc<ProxyState>>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, StatusCode> {
    let path = uri.path();
    if path != "/health" && !bearer_matches(&headers, &st.token) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let pq = uri
        .path_and_query()
        .map(|x| x.as_str())
        .unwrap_or(path);
    let url = format!("{}{}", st.upstream, pq);
    let mut rb = st.client.request(method.clone(), &url);
    for (name, value) in headers.iter() {
        let n = name.as_str();
        if n.eq_ignore_ascii_case("host") || n.eq_ignore_ascii_case("connection") {
            continue;
        }
        if let Ok(s) = value.to_str() {
            rb = rb.header(name, s);
        }
    }
    let upstream = rb
        .body(body)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    let status = upstream.status();
    let mut out_headers = HeaderMap::new();
    for (k, v) in upstream.headers().iter() {
        if k == reqwest::header::TRANSFER_ENCODING {
            continue;
        }
        out_headers.insert(k, v.clone());
    }
    let stream = upstream.bytes_stream().map(|chunk| {
        chunk.map_err(|e| std::io::Error::other(e.to_string()))
    });
    let body = Body::from_stream(stream);
    let mut res = Response::new(body);
    *res.status_mut() = status;
    *res.headers_mut() = out_headers;
    Ok(res)
}

fn register_mdns(
    proxy_port: u16,
    device_name: &str,
) -> Result<mdns_sd::ServiceDaemon, String> {
    let mdns = mdns_sd::ServiceDaemon::new().map_err(|e| e.to_string())?;
    let host = hostname::get()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "brightvision".into());
    let instance = format!(
        "BrightVision-{}",
        host.chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect::<String>()
    );
    let props: HashMap<String, String> = HashMap::from([
        ("device".to_string(), device_name.to_string()),
        ("v".to_string(), "1".to_string()),
    ]);
    let my_addrs: Vec<std::net::IpAddr> = list_lan_ipv4_addresses()
        .into_iter()
        .filter_map(|s| s.parse().ok())
        .collect();
    let info = mdns_sd::ServiceInfo::new(
        MDNS_SERVICE_TYPE,
        &instance,
        &format!("{host}.local."),
        &my_addrs[..],
        proxy_port,
        props,
    )
    .map_err(|e| e.to_string())?;
    mdns.register(info).map_err(|e| e.to_string())?;
    Ok(mdns)
}

pub async fn start_lan_remote(
    slot: &Mutex<Option<LanRemoteHandle>>,
    token: String,
    core_port: u16,
    proxy_port: u16,
    device_name: String,
) -> Result<LanRemoteStatus, String> {
    stop_lan_remote(slot).await;
    if token.trim().is_empty() {
        return Err("Vision API token is required for LAN remote".into());
    }
    let upstream = format!("http://127.0.0.1:{core_port}");
    let client = Client::builder()
        .build()
        .map_err(|e| e.to_string())?;
    let state = Arc::new(ProxyState {
        client,
        upstream,
        token: token.trim().to_string(),
    });
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    let app = Router::new()
        .fallback(any(proxy_route))
        .with_state(state)
        .layer(cors);
    let addr = SocketAddr::from(([0, 0, 0, 0], proxy_port));
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    let server = tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .expect("lan proxy bind");
        let shutdown = async {
            let mut rx = shutdown_rx;
            loop {
                if *rx.borrow() {
                    break;
                }
                if rx.changed().await.is_err() {
                    break;
                }
            }
        };
        let serve = axum::serve(listener, app);
        let _ = serve.with_graceful_shutdown(shutdown).await;
    });
    let mdns = register_mdns(proxy_port, &device_name).ok();
    *slot.lock().await = Some(LanRemoteHandle {
        proxy_port,
        shutdown: shutdown_tx,
        server,
        mdns,
    });
    Ok(LanRemoteStatus {
        running: true,
        proxy_port,
        core_port,
        addresses: list_lan_ipv4_addresses(),
    })
}

pub async fn stop_lan_remote(slot: &Mutex<Option<LanRemoteHandle>>) {
    let mut guard = slot.lock().await;
    if let Some(handle) = guard.take() {
        let _ = handle.shutdown.send(true);
        let _ = handle.server.await;
        if let Some(daemon) = handle.mdns {
            let _ = daemon.shutdown();
        }
    }
}

pub async fn lan_remote_status(
    slot: &Mutex<Option<LanRemoteHandle>>,
    core_port: u16,
) -> LanRemoteStatus {
    let guard = slot.lock().await;
    let running = guard.is_some();
    let proxy_port = guard
        .as_ref()
        .map(|h| h.proxy_port)
        .unwrap_or(DEFAULT_LAN_PROXY_PORT);
    LanRemoteStatus {
        running,
        proxy_port,
        core_port,
        addresses: list_lan_ipv4_addresses(),
    }
}
