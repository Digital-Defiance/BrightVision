"""Tests for bright_vision_core.llm_backends.metadata_resolver."""

from __future__ import annotations

import logging

import pytest

from bright_vision_core.llm_backends.metadata_resolver import (
    _DEFAULT_ESTIMATED_VRAM_MB,
    _DEFAULT_MAX_CONTEXT,
    resolve_static_metadata,
)


class TestKnownModelLookup:
    """REQ-005.1: Known models return registry values."""

    def test_qwen2_5_coder_7b(self) -> None:
        result = resolve_static_metadata("qwen2.5-coder:7b")
        assert result["max_context"] == 32768
        assert result["estimated_vram_mb"] == 4800

    def test_llama3_1_8b(self) -> None:
        result = resolve_static_metadata("llama3.1:8b")
        assert result["max_context"] == 131072
        assert result["estimated_vram_mb"] == 6400

    def test_phi3_5_3_8b(self) -> None:
        result = resolve_static_metadata("phi3.5:3.8b")
        assert result["max_context"] == 128000
        assert result["estimated_vram_mb"] == 2800


class TestUnknownFallback:
    """REQ-005.2: Unknown models fall back to defaults with WARN log."""

    def test_unknown_model_returns_defaults(self) -> None:
        result = resolve_static_metadata("totally-new-model:latest")
        assert result["max_context"] == _DEFAULT_MAX_CONTEXT
        assert result["estimated_vram_mb"] == _DEFAULT_ESTIMATED_VRAM_MB

    def test_unknown_model_logs_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.WARNING, logger="bright_vision_core.llm_backends.metadata_resolver"):
            resolve_static_metadata("unknown-model:v1")
        assert any("not found in metadata registry" in record.message for record in caplog.records)

    def test_empty_string_model_returns_defaults(self) -> None:
        result = resolve_static_metadata("")
        assert result["max_context"] == _DEFAULT_MAX_CONTEXT
        assert result["estimated_vram_mb"] == _DEFAULT_ESTIMATED_VRAM_MB


class TestUserOverrideWins:
    """REQ-005.3: User override takes priority over registry values."""

    def test_user_override_vram_known_model(self) -> None:
        result = resolve_static_metadata("qwen2.5-coder:7b", user_override_mb=10240)
        assert result["max_context"] == 32768
        assert result["estimated_vram_mb"] == 10240

    def test_user_override_vram_unknown_model(self) -> None:
        result = resolve_static_metadata("unknown-model", user_override_mb=5120)
        assert result["max_context"] == _DEFAULT_MAX_CONTEXT
        assert result["estimated_vram_mb"] == 5120