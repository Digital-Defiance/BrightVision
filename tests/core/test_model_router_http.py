"""HTTP API model_router payload (think/code/fast roles)."""

from __future__ import annotations

from bright_vision_core.http_api import ModelRouterRequest
from bright_vision_core.model_router import ModelRouterConfig


def test_model_router_request_accepts_think_and_code():
    body = ModelRouterRequest(
        enabled=True,
        fast_model="ollama_chat/fast",
        code_model="ollama_chat/code",
        think_model="ollama_chat/think",
        model_pool=[
            {"model": "ollama_chat/fast", "tier": "fast", "enabled": True},
            {"model": "ollama_chat/code", "tier": "code", "enabled": True},
            {"model": "ollama_chat/think", "tier": "think", "enabled": True},
        ],
    )
    dumped = body.model_dump()
    assert dumped["code_model"] == "ollama_chat/code"
    assert dumped["think_model"] == "ollama_chat/think"


def test_from_payload_round_trip_think_code():
    raw = {
        "enabled": True,
        "fast_model": "ollama_chat/fast",
        "code_model": "ollama_chat/code",
        "think_model": "ollama_chat/think",
        "model_pool": [
            {"model": "ollama_chat/fast", "tier": "fast", "enabled": True},
            {"model": "", "tier": "code", "enabled": True},
            {"model": "ollama_chat/think", "tier": "think", "enabled": True},
        ],
        "keep_alive_heavy": 0,
    }
    cfg = ModelRouterConfig.from_payload(raw)
    assert cfg is not None
    assert cfg.resolved_code_model == "ollama_chat/code"
    assert cfg.resolved_think_model == "ollama_chat/think"
    assert cfg.keep_alive_heavy == -1
