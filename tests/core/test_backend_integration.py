"""Integration tests for backend registry + router prefix wiring."""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from bright_vision_core.llm_backends.registry import BackendRegistry
from bright_vision_core.llm_backends.vllm_client import VLLMBackendClient
from bright_vision_core.model_router import ModelRouterConfig, resolve_provider_prefix


class TestBackendIntegration:
    def setup_method(self):
        BackendRegistry.clear()

    def teardown_method(self):
        BackendRegistry.clear()

    @pytest.mark.asyncio
    async def test_vllm_env_selects_client_and_prefix(self):
        with patch.dict(os.environ, {"BRIGHTVISION_LLM_BACKEND": "vllm"}):
            client = BackendRegistry.get_active()
            assert isinstance(client, VLLMBackendClient)
            assert resolve_provider_prefix("vllm") == "openai/"
            loaded = await client.preload_models(["any-model"])
            assert loaded == []

    def test_router_config_matches_registry_backend(self):
        with patch.dict(os.environ, {"BRIGHTVISION_LLM_BACKEND": "llamacpp"}):
            BackendRegistry.get_active()
            cfg = ModelRouterConfig(enabled=True, backend="llamacpp", fast_model="m")
            assert cfg.provider_prefix == "openai/"
