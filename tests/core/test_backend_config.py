"""Tests for bright_vision_core.llm_backends.config."""

from __future__ import annotations

import json
import os
import platform
from pathlib import Path
from unittest.mock import patch

import pytest

from bright_vision_core.llm_backends.config import (
    ALLOWED_BACKENDS,
    UNSUPPORTED_PLATFORMS,
    _CONFIG_FILE,
    persist_backend_config,
    resolve_backend_config,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_persisted(data: dict) -> None:
    """Helper to write a persisted config file."""
    _CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_CONFIG_FILE, "w", encoding="utf-8") as fh:
        json.dump(data, fh)


def _clean_persisted() -> None:
    """Remove the persisted config file if it exists."""
    if _CONFIG_FILE.exists():
        _CONFIG_FILE.unlink()


@pytest.fixture
def no_local_llm_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ignore repo ``local-llm.env`` so tests isolate env/persisted/default."""
    monkeypatch.setattr(
        "bright_vision_core.llm_backends.config._backend_from_local_llm_env_files",
        lambda: "",
    )
    monkeypatch.setattr(
        "bright_vision_core.llm_backends.config._load_local_llm_env_files",
        lambda: {},
    )


# ---------------------------------------------------------------------------
# REQ-001.1: Environment variable takes highest priority
# ---------------------------------------------------------------------------


class TestEnvVarPrecedence:
    """REQ-001.1: ``BRIGHTVISION_LLM_BACKEND`` env var overrides persisted config."""

    def test_env_var_overrides_persisted_config(self, no_local_llm_env: None) -> None:
        _write_persisted({"active_backend": "vllm", "backend_url": "http://old:8000"})
        try:
            with patch.dict(os.environ, {"BRIGHTVISION_LLM_BACKEND": "llamacpp"}):
                result = resolve_backend_config()
            assert result["active_backend"] == "llamacpp"
        finally:
            _clean_persisted()

    def test_env_var_with_custom_url(self) -> None:
        with patch.dict(
            os.environ,
            {
                "BRIGHTVISION_LLM_BACKEND": "vllm",
                "BRIGHTVISION_LLM_BACKEND_URL": "http://custom:8080",
            },
        ):
            result = resolve_backend_config()

        assert result["active_backend"] == "vllm"
        assert result["backend_url"] == "http://custom:8080"
        assert result["platform_supported"] is True

    def test_env_var_empty_uses_persisted(self, no_local_llm_env: None) -> None:
        _write_persisted({"active_backend": "tgi", "backend_url": "http://tgi:3000"})
        try:
            with patch.dict(os.environ, {"BRIGHTVISION_LLM_BACKEND": ""}):
                result = resolve_backend_config()
            assert result["active_backend"] == "tgi"
        finally:
            _clean_persisted()

    def test_env_var_unset_uses_persisted(self, no_local_llm_env: None) -> None:
        _write_persisted({"active_backend": "mlx-lm", "backend_url": "http://mlx:8000"})
        try:
            env_val = os.environ.pop("BRIGHTVISION_LLM_BACKEND", None)
            try:
                result = resolve_backend_config()
                assert result["active_backend"] == "mlx-lm"
            finally:
                if env_val is not None:
                    os.environ["BRIGHTVISION_LLM_BACKEND"] = env_val
        finally:
            _clean_persisted()

    def test_env_var_default_uses_default_config(self, no_local_llm_env: None) -> None:
        """When no persisted config exists and env is unset, platform default."""
        env_val = os.environ.pop("BRIGHTVISION_LLM_BACKEND", None)
        try:
            _clean_persisted()
            result = resolve_backend_config()
            if platform.system().lower() == "darwin":
                assert result["active_backend"] == "lmstudio"
                assert result["backend_url"] == "http://127.0.0.1:1234"
            else:
                assert result["active_backend"] == "ollama"
                assert result["backend_url"] == "http://localhost:11434"
            assert result["platform_supported"] is True
        finally:
            if env_val is not None:
                os.environ["BRIGHTVISION_LLM_BACKEND"] = env_val


# ---------------------------------------------------------------------------
# REQ-001.2: Invalid backend names default to ollama
# ---------------------------------------------------------------------------


class TestInvalidBackendFallback:
    """REQ-001.2: Unknown or misspelled backends fall back to ``ollama``."""

    def test_invalid_persisted_backend_defaults_to_ollama(self, no_local_llm_env: None) -> None:
        _write_persisted({"active_backend": "invalid_backend_xyz"})
        try:
            result = resolve_backend_config()
            assert result["active_backend"] == "ollama"
        finally:
            _clean_persisted()

    def test_env_var_invalid_defaults_to_ollama(self) -> None:
        with patch.dict(os.environ, {"BRIGHTVISION_LLM_BACKEND": "nonexistent"}):
            result = resolve_backend_config()
        assert result["active_backend"] == "ollama"

    def test_allowed_backends_contains_expected_set(self) -> None:
        expected = {"ollama", "lmstudio", "llamacpp", "vllm", "tgi", "mlx-lm"}
        assert ALLOWED_BACKENDS == frozenset(expected)


# ---------------------------------------------------------------------------
# REQ-001.4: Platform compatibility check
# ---------------------------------------------------------------------------


class TestPlatformCompatibility:
    """REQ-001.4: Unsupported backends on the current platform fall back to ollama."""

    def test_unsupported_persisted_backend_falls_back(self, no_local_llm_env: None) -> None:
        """Persisted mlx-lm on Linux should fall back to ollama."""
        _write_persisted({"active_backend": "mlx-lm", "backend_url": "http://mlx:8000"})
        try:
            with patch("platform.system", return_value="linux"):
                result = resolve_backend_config()
            assert result["active_backend"] == "ollama"
        finally:
            _clean_persisted()

    def test_unsupported_env_var_falls_back(self) -> None:
        with patch.dict(os.environ, {"BRIGHTVISION_LLM_BACKEND": "llamacpp"}):
            with patch("platform.system", return_value="win32"):
                result = resolve_backend_config()
        assert result["active_backend"] == "ollama"

    def test_supported_platform_returns_active(self, no_local_llm_env: None) -> None:
        _write_persisted({"active_backend": "ollama"})
        try:
            with patch("platform.system", return_value="darwin"):
                result = resolve_backend_config()
            assert result["active_backend"] == "ollama"
            assert result["platform_supported"] is True
        finally:
            _clean_persisted()

    def test_unsupported_platforms_map(self) -> None:
        """Verify the UNSUPPORTED_PLATFORMS dict has expected entries."""
        assert "darwin" in UNSUPPORTED_PLATFORMS
        assert "linux" in UNSUPPORTED_PLATFORMS
        assert "win32" in UNSUPPORTED_PLATFORMS
        # mlx-lm should be unsupported on Linux
        assert "mlx-lm" in UNSUPPORTED_PLATFORMS["linux"]
        # win32 should block llamacpp, vllm, tgi, mlx-lm
        for backend in ("llamacpp", "vllm", "tgi", "mlx-lm"):
            assert backend in UNSUPPORTED_PLATFORMS["win32"]


# ---------------------------------------------------------------------------
# REQ-001.3: Config persistence round-trip
# ---------------------------------------------------------------------------


class TestPersistRoundTrip:
    """REQ-001.3: ``persist_backend_config`` produces valid JSON read back by ``resolve_backend_config``."""

    def test_persist_and_resolve_round_trip(self, no_local_llm_env: None) -> None:
        config = {
            "active_backend": "vllm",
            "backend_url": "http://test:8000",
            "platform_supported": True,
            "user_vram_override_mb": 8192,
        }
        persist_backend_config(config)

        env_val = os.environ.pop("BRIGHTVISION_LLM_BACKEND", None)
        try:
            result = resolve_backend_config()
            assert result["active_backend"] == "vllm"
            assert result["backend_url"] == "http://test:8000"
            assert result["platform_supported"] is True
            assert result["user_vram_override_mb"] == 8192
        finally:
            if env_val is not None:
                os.environ["BRIGHTVISION_LLM_BACKEND"] = env_val
            _clean_persisted()

    def test_persist_writes_valid_json(self) -> None:
        config = {"active_backend": "tgi", "backend_url": "http://tgi:8000"}
        path = persist_backend_config(config)
        assert path.exists()
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        assert data["active_backend"] == "tgi"
        _clean_persisted()

    def test_persist_creates_config_dir(self) -> None:
        """persist_backend_config should create ``~/.config/brightvision`` if missing."""
        # Remove the directory first to test creation
        config_dir = _CONFIG_FILE.parent
        if config_dir.exists():
            import shutil

            shutil.rmtree(config_dir)

        persist_backend_config({"active_backend": "ollama"})
        assert config_dir.exists()
        _clean_persisted()