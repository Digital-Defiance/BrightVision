"""Headless router env vars (BRIGHT_VISION_*)."""

from __future__ import annotations

from bright_vision_core.model_router import ModelRouterConfig


def test_from_env_code_and_think(monkeypatch):
    monkeypatch.setenv("BRIGHT_VISION_MODEL_ROUTER", "1")
    monkeypatch.setenv("BRIGHT_VISION_FAST_MODEL", "ollama_chat/fast")
    monkeypatch.setenv("BRIGHT_VISION_CODE_MODEL", "ollama_chat/code")
    monkeypatch.setenv("BRIGHT_VISION_THINK_MODEL", "ollama_chat/think")
    cfg = ModelRouterConfig.from_env()
    assert cfg is not None
    assert cfg.enabled is True
    assert cfg.fast_model == "ollama_chat/fast"
    assert cfg.code_model == "ollama_chat/code"
    assert cfg.think_model == "ollama_chat/think"


def test_from_env_heavy_alias_for_code(monkeypatch):
    monkeypatch.setenv("BRIGHT_VISION_MODEL_ROUTER", "1")
    monkeypatch.setenv("BRIGHT_VISION_FAST_MODEL", "ollama_chat/fast")
    monkeypatch.setenv("BRIGHT_VISION_HEAVY_MODEL", "ollama_chat/legacy-code")
    cfg = ModelRouterConfig.from_env()
    assert cfg is not None
    assert cfg.code_model == "ollama_chat/legacy-code"
