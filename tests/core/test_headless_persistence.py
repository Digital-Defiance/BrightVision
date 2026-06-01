"""Headless persistence flags (Cecli session encrypt / auto-save)."""

from __future__ import annotations

import base64
import os
from types import SimpleNamespace

import pytest

from bright_vision_core.headless_args import default_headless_args
from bright_vision_core.headless_persistence import (
    apply_persistence_to_args,
    session_crypto_key_available,
)


@pytest.fixture
def key32():
    return os.urandom(32)


@pytest.fixture
def key_b64(key32):
    return base64.urlsafe_b64encode(key32).decode().rstrip("=")


def test_default_headless_args_includes_persistence_fields():
    args = default_headless_args()
    assert args.session_encrypt is False
    assert args.auto_save is False
    assert args.auto_load is False
    assert args.auto_save_session_name == "auto-save"
    assert args.session_key_file is None


def test_apply_persistence_sets_flags():
    args = apply_persistence_to_args(
        default_headless_args(),
        session_encrypt=False,
        auto_save=True,
        auto_load=True,
        auto_save_session_name="brightvision",
    )
    assert args.auto_save is True
    assert args.auto_load is True
    assert args.auto_save_session_name == "brightvision"


def test_apply_encrypt_disabled_without_key(monkeypatch):
    monkeypatch.delenv("CECLI_SESSION_KEY", raising=False)
    args = apply_persistence_to_args(default_headless_args(), session_encrypt=True)
    assert args.session_encrypt is False


def test_apply_encrypt_enabled_with_env(monkeypatch, key_b64):
    monkeypatch.setenv("CECLI_SESSION_KEY", key_b64)
    args = apply_persistence_to_args(default_headless_args(), session_encrypt=True)
    assert args.session_encrypt is True
    assert session_crypto_key_available()


def test_apply_encrypt_enabled_with_key_file(tmp_path, key32):
    path = tmp_path / "key"
    path.write_text(base64.urlsafe_b64encode(key32).decode(), encoding="utf-8")
    args = apply_persistence_to_args(
        default_headless_args(),
        session_encrypt=True,
        session_key_file=str(path),
    )
    assert args.session_encrypt is True


def test_apply_persistence_does_not_mutate_default_template():
    template = default_headless_args()
    apply_persistence_to_args(template, auto_save=True)
    assert template.auto_save is False
