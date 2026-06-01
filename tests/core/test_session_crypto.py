"""Cecli session encryption helpers (used by BrightVision headless sessions)."""

import base64
import json
import os
from pathlib import Path

import pytest

from bright_vision_core.cecli_session_crypto import (
    require_session_crypto_module,
    session_crypto_available,
)

pytestmark = pytest.mark.skipif(
    not session_crypto_available(),
    reason="cecli v0.100.2+ required (cecli.helpers.crypto)",
)

session_crypto = require_session_crypto_module()


@pytest.fixture
def key32():
    return os.urandom(32)


@pytest.fixture
def key_b64(key32):
    return base64.urlsafe_b64encode(key32).decode().rstrip("=")


def test_encrypt_roundtrip(key32):
    payload = {"version": 1, "session_name": "bv", "model": "ollama_chat/test"}
    blob = session_crypto.encrypt_session_dict(payload, key32)
    assert session_crypto.is_encrypted_payload(blob)
    assert session_crypto.decrypt_session_bytes(blob, key32) == payload


def test_is_encrypted_rejects_plain_json():
    raw = json.dumps({"version": 1}).encode("utf-8")
    assert not session_crypto.is_encrypted_payload(raw)


def test_decrypt_plain_json_rejected(key32):
    """v0.100.2+ crypto: callers must use is_encrypted_payload before decrypt."""
    raw = json.dumps({"version": 1, "session_name": "legacy"}).encode("utf-8")
    assert not session_crypto.is_encrypted_payload(raw)
    with pytest.raises(session_crypto.SessionCryptoError):
        session_crypto.decrypt_session_bytes(raw, key32)


def test_wrong_key_raises(key32):
    blob = session_crypto.encrypt_session_dict({"version": 1}, key32)
    with pytest.raises(session_crypto.SessionCryptoError):
        session_crypto.decrypt_session_bytes(blob, os.urandom(32))


def test_invalid_key_length_rejected():
    with pytest.raises(session_crypto.SessionCryptoError):
        session_crypto.encrypt_session_dict({"version": 1}, b"short")


def test_resolve_key_from_env(monkeypatch, key_b64, key32):
    monkeypatch.setenv(session_crypto.KEY_ENV, key_b64)
    assert session_crypto.resolve_key() == key32


def test_resolve_key_from_file(tmp_path, key32):
    path = tmp_path / "session.key"
    path.write_text(base64.urlsafe_b64encode(key32).decode(), encoding="utf-8")
    assert session_crypto.resolve_key(key_file=path) == key32


def test_resolve_key_missing_returns_none(monkeypatch):
    monkeypatch.delenv(session_crypto.KEY_ENV, raising=False)
    assert session_crypto.resolve_key() is None


def test_encrypted_file_roundtrip_on_disk(tmp_path, key32):
    path = tmp_path / "sess.json"
    payload = {"version": 1, "session_name": "disk"}
    path.write_bytes(session_crypto.encrypt_session_dict(payload, key32))
    raw = path.read_bytes()
    assert session_crypto.is_encrypted_payload(raw)
    assert session_crypto.decrypt_session_bytes(raw, key32) == payload


def test_headless_persistence_requires_key(monkeypatch):
    from bright_vision_core.headless_args import default_headless_args
    from bright_vision_core.headless_persistence import apply_persistence_to_args

    monkeypatch.delenv(session_crypto.KEY_ENV, raising=False)
    args = apply_persistence_to_args(default_headless_args(), session_encrypt=True)
    assert args.session_encrypt is False
