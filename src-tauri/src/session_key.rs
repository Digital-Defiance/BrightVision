//! OS keychain storage for the Cecli session encryption key (32 bytes, urlsafe base64).

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use getrandom::getrandom;

const SERVICE: &str = "com.digitaldefiance.bright-vision";
const ACCOUNT: &str = "session-encryption-key";
const KEY_LEN: usize = 32;

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

fn valid_key_b64(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    let padded = format!("{trimmed}{}", "=".repeat((4 - trimmed.len() % 4) % 4));
    let Ok(bytes) = URL_SAFE_NO_PAD.decode(padded.as_bytes()) else {
        return false;
    };
    bytes.len() == KEY_LEN
}

/// Return urlsafe-base64 session key; create and store in the OS keychain if missing.
#[tauri::command]
pub fn ensure_session_encryption_key() -> Result<String, String> {
    let entry = entry()?;
    if let Ok(existing) = entry.get_password() {
        if valid_key_b64(&existing) {
            return Ok(existing.trim().to_string());
        }
    }
    let mut key = [0u8; KEY_LEN];
    getrandom(&mut key).map_err(|e| format!("random key generation failed: {e}"))?;
    let encoded = URL_SAFE_NO_PAD.encode(key);
    entry
        .set_password(&encoded)
        .map_err(|e| format!("keychain write failed: {e}"))?;
    Ok(encoded)
}

#[tauri::command]
pub fn clear_session_encryption_key() -> Result<(), String> {
    let entry = entry()?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
