"""Tests for LiteLLM provider prefix mapping and auth injection."""

from __future__ import annotations

import json
import os
from unittest.mock import patch

import pytest

from bright_vision_core.model_router import (
    ModelRouterConfig,
    inject_backend_extra_params,
    resolve_provider_prefix,
)


class TestResolveProviderPrefix:
    @pytest.mark.parametrize(
        ("backend", "expected"),
        [
            ("ollama", "ollama_chat/"),
            ("vllm", "openai/"),
            ("tgi", "openai/"),
            ("llamacpp", "openai/"),
            ("lmstudio", "openai/"),
            ("mlx-lm", "openai/"),
            ("unknown", "ollama_chat/"),
            ("", "ollama_chat/"),
        ],
    )
    def test_prefix_mapping(self, backend: str, expected: str):
        assert resolve_provider_prefix(backend) == expected

    def test_model_router_config_wires_prefix(self):
        cfg = ModelRouterConfig(enabled=True, backend="vllm", fast_model="qwen2.5-coder:7b")
        assert cfg.provider_prefix == "openai/"
        assert cfg.backend == "vllm"


class TestInjectBackendExtraParams:
    def test_ollama_does_not_inject(self):
        with patch.dict(os.environ, {"LITELLM_EXTRA_PARAMS": '{"api_key":"secret"}'}):
            assert inject_backend_extra_params("ollama", {"keep": 1}) == {"keep": 1}

    def test_vllm_merges_litellm_extra_params(self):
        payload = json.dumps({"api_base": "http://127.0.0.1:8000/v1", "api_key": "test"})
        with patch.dict(os.environ, {"LITELLM_EXTRA_PARAMS": payload}):
            result = inject_backend_extra_params("vllm", {"timeout": 30})
            assert result["timeout"] == 30
            assert result["api_base"] == "http://127.0.0.1:8000/v1"
            assert result["api_key"] == "test"

    def test_invalid_json_is_ignored(self):
        with patch.dict(os.environ, {"LITELLM_EXTRA_PARAMS": "not-json"}):
            assert inject_backend_extra_params("vllm", {}) == {}

    def test_unset_env_preserves_existing(self):
        env_val = os.environ.pop("LITELLM_EXTRA_PARAMS", None)
        try:
            assert inject_backend_extra_params("vllm", {"a": 1}) == {"a": 1}
        finally:
            if env_val is not None:
                os.environ["LITELLM_EXTRA_PARAMS"] = env_val
