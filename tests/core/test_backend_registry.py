"""Tests for BackendRegistry — defaults, switching, unknown backend handling."""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from bright_vision_core.llm_backends.registry import BackendRegistry
from bright_vision_core.llm_backends.ollama_client import OllamaBackendClient
from bright_vision_core.llm_backends.vllm_client import VLLMBackendClient
from bright_vision_core.llm_backends.llamacpp_client import LlamaCppBackendClient


class TestRegistryDefaults:
    """Tests for default registry behavior."""

    def setup_method(self) -> None:
        BackendRegistry.clear()

    def teardown_method(self) -> None:
        BackendRegistry.clear()

    def test_default_active_backend_is_ollama(self, monkeypatch, tmp_path):
        """Default backend follows platform when no env var is set."""
        monkeypatch.setattr(
            "bright_vision_core.llm_backends.config._backend_from_local_llm_env_files",
            lambda: "",
        )
        monkeypatch.setattr(
            "bright_vision_core.llm_backends.config._load_local_llm_env_files",
            lambda: {},
        )
        with patch.dict(os.environ, {}, clear=True):
            client = BackendRegistry.get_active()
            import platform

            if platform.system().lower() == "darwin":
                from bright_vision_core.llm_backends.lmstudio_client import (
                    LmStudioBackendClient,
                )

                assert isinstance(client, LmStudioBackendClient)
            else:
                assert isinstance(client, OllamaBackendClient)

    def test_get_active_returns_singleton(self):
        """Multiple get_active calls should return the same instance."""
        with patch.dict(os.environ, {}, clear=True):
            client1 = BackendRegistry.get_active()
            client2 = BackendRegistry.get_active()
            assert client1 is client2


class TestSetActive:
    """Tests for switching backends."""

    def setup_method(self) -> None:
        BackendRegistry.clear()

    def teardown_method(self) -> None:
        BackendRegistry.clear()

    def test_set_active_switches_to_vllm(self):
        """set_active should switch to the specified backend."""
        with patch.dict(os.environ, {}, clear=True):
            BackendRegistry.set_active("vllm")
            client = BackendRegistry.get_active()
            assert isinstance(client, VLLMBackendClient)

    def test_set_active_switches_to_llamacpp(self):
        """set_active should switch to llama.cpp backend."""
        with patch.dict(os.environ, {}, clear=True):
            BackendRegistry.clear()  # Reset first
            BackendRegistry.set_active("llamacpp")
            client = BackendRegistry.get_active()
            assert isinstance(client, LlamaCppBackendClient)

    def test_set_active_caches_client(self):
        """set_active should create a new instance each call."""
        with patch.dict(os.environ, {}, clear=True):
            BackendRegistry.clear()
            BackendRegistry.set_active("vllm")
            client1 = BackendRegistry.get_active()
            BackendRegistry.set_active("vllm")
            client2 = BackendRegistry.get_active()
            assert client1 is not client2  # New instance created each time

    def test_set_active_updates_active_name(self):
        """set_active should update the active backend name."""
        with patch.dict(os.environ, {}, clear=True):
            BackendRegistry.clear()
            BackendRegistry.set_active("vllm")
            assert BackendRegistry._active_name == "vllm"

    def test_set_active_unknown_backend_raises_type_error(self):
        """Unknown backend should raise TypeError when instantiated."""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(TypeError):
                BackendRegistry.set_active("nonexistent")


class TestClear:
    """Tests for registry clearing."""

    def test_clear_resets_state(self):
        """clear() should reset all internal state."""
        with patch.dict(os.environ, {}, clear=True):
            BackendRegistry.get_active()
            BackendRegistry.clear()
            assert BackendRegistry._client is None
            assert BackendRegistry._active_name is None

    def test_get_active_after_clear_reinstantiate(self, monkeypatch):
        """get_active() after clear should create a new client."""
        monkeypatch.setattr(
            "bright_vision_core.llm_backends.config._backend_from_local_llm_env_files",
            lambda: "",
        )
        monkeypatch.setattr(
            "bright_vision_core.llm_backends.config._load_local_llm_env_files",
            lambda: {},
        )
        with patch.dict(os.environ, {}, clear=True):
            BackendRegistry.get_active()
            BackendRegistry.clear()
            client = BackendRegistry.get_active()
            import platform

            if platform.system().lower() == "darwin":
                from bright_vision_core.llm_backends.lmstudio_client import (
                    LmStudioBackendClient,
                )

                assert isinstance(client, LmStudioBackendClient)
            else:
                assert isinstance(client, OllamaBackendClient)


class TestEnvOverride:
    """Tests for environment variable overrides."""

    def setup_method(self) -> None:
        BackendRegistry.clear()

    def teardown_method(self) -> None:
        BackendRegistry.clear()

    def test_env_var_vllm_override(self):
        """BRIGHTVISION_LLM_BACKEND should override default."""
        with patch.dict(os.environ, {"BRIGHTVISION_LLM_BACKEND": "vllm"}):
            client = BackendRegistry.get_active()
            assert isinstance(client, VLLMBackendClient)

    def test_env_var_llamacpp_override(self):
        """BRIGHTVISION_LLM_BACKEND should work with llamacpp."""
        with patch.dict(os.environ, {"BRIGHTVISION_LLM_BACKEND": "llamacpp"}):
            client = BackendRegistry.get_active()
            assert isinstance(client, LlamaCppBackendClient)

    def test_empty_env_var_falls_back_to_default(self, monkeypatch):
        """Empty env var should fall back to platform default."""
        monkeypatch.setattr(
            "bright_vision_core.llm_backends.config._backend_from_local_llm_env_files",
            lambda: "",
        )
        monkeypatch.setattr(
            "bright_vision_core.llm_backends.config._load_local_llm_env_files",
            lambda: {},
        )
        with patch.dict(os.environ, {"BRIGHTVISION_LLM_BACKEND": ""}):
            client = BackendRegistry.get_active()
            import platform

            if platform.system().lower() == "darwin":
                from bright_vision_core.llm_backends.lmstudio_client import (
                    LmStudioBackendClient,
                )

                assert isinstance(client, LmStudioBackendClient)
            else:
                assert isinstance(client, OllamaBackendClient)