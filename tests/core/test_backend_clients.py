"""Tests for backend clients — protocol compliance, mock HTTP, error logging, no-ops."""

from __future__ import annotations

import json
import logging
from unittest.mock import MagicMock, patch

import httpx
import pytest

from bright_vision_core.llm_backends.ollama_client import OllamaBackendClient
from bright_vision_core.llm_backends.vllm_client import VLLMBackendClient
from bright_vision_core.llm_backends.llamacpp_client import LlamaCppBackendClient
from bright_vision_core.llm_backends.base import BackendClient


def _mock_response(status_code: int = 200, json_data: dict | list | None = None) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    resp.raise_for_status.return_value = None
    return resp


class TestOllamaBackendClient:
    def test_preload_models_success(self, caplog):
        models = ["qwen2.5-coder:7b"]
        with patch("bright_vision_core.llm_backends.ollama_client.httpx.Client") as MockClient:
            resp = _mock_response(json_data={"status": "success"})
            MockClient.return_value.__enter__.return_value.post.return_value = resp
            client = OllamaBackendClient()
            loaded = client.preload_models(models)
            assert loaded == models

    def test_preload_models_timeout_logs_error(self, caplog):
        with patch("bright_vision_core.llm_backends.ollama_client.httpx.Client") as MockClient:
            MockClient.return_value.__enter__.side_effect = httpx.TimeoutException("timed out")
            with caplog.at_level(logging.ERROR):
                client = OllamaBackendClient()
                loaded = client.preload_models(["qwen2.5-coder:7b"])
                assert loaded == []
                assert any("failed to preload" in r.message for r in caplog.records)

    def test_get_vram_usage_success(self):
        json_data = {
            "models": [
                {"name": "qwen2.5-coder:7b", "size_vram": 4800 * 1024 * 1024},
                {"name": "llama3:8b", "size_vram": 8 * 1024 * 1024},
            ]
        }
        with patch("bright_vision_core.llm_backends.ollama_client.httpx.Client") as MockClient:
            resp = _mock_response(json_data=json_data)
            MockClient.return_value.__enter__.return_value.get.return_value = resp
            client = OllamaBackendClient()
            vram = client.get_vram_usage()
            assert vram == 4808

    def test_get_vram_usage_unreachable(self, caplog):
        with patch("bright_vision_core.llm_backends.ollama_client.httpx.Client") as MockClient:
            MockClient.return_value.__enter__.side_effect = httpx.ConnectError("connection refused")
            with caplog.at_level(logging.ERROR):
                client = OllamaBackendClient()
                vram = client.get_vram_usage()
                assert vram is None

    def test_get_context_window_success(self):
        json_data = {"models": [{"name": "qwen2.5-coder:7b", "details": {"context_length": 32768}}]}
        with patch("bright_vision_core.llm_backends.ollama_client.httpx.Client") as MockClient:
            resp = _mock_response(json_data=json_data)
            MockClient.return_value.__enter__.return_value.get.return_value = resp
            client = OllamaBackendClient()
            ctx = client.get_context_window("qwen2.5-coder:7b")
            assert ctx == 32768

    def test_get_context_window_not_found(self):
        json_data = {"models": [{"name": "other-model", "details": {"context_length": 8192}}]}
        with patch("bright_vision_core.llm_backends.ollama_client.httpx.Client") as MockClient:
            resp = _mock_response(json_data=json_data)
            MockClient.return_value.__enter__.return_value.get.return_value = resp
            client = OllamaBackendClient()
            ctx = client.get_context_window("qwen2.5-coder:7b")
            assert ctx is None

    def test_list_available_models_success(self):
        json_data = {"models": [{"name": "qwen2.5-coder:7b"}, {"name": "llama3:8b"}]}
        with patch("bright_vision_core.llm_backends.ollama_client.httpx.Client") as MockClient:
            resp = _mock_response(json_data=json_data)
            MockClient.return_value.__enter__.return_value.get.return_value = resp
            client = OllamaBackendClient()
            names = client.list_available_models()
            assert names == ["qwen2.5-coder:7b", "llama3:8b"]

    def test_list_available_models_empty(self):
        json_data = {"models": []}
        with patch("bright_vision_core.llm_backends.ollama_client.httpx.Client") as MockClient:
            resp = _mock_response(json_data=json_data)
            MockClient.return_value.__enter__.return_value.get.return_value = resp
            client = OllamaBackendClient()
            names = client.list_available_models()
            assert names == []

    def test_list_available_models_unreachable(self, caplog):
        with patch("bright_vision_core.llm_backends.ollama_client.httpx.Client") as MockClient:
            MockClient.return_value.__enter__.side_effect = httpx.ConnectError("connection refused")
            with caplog.at_level(logging.ERROR):
                client = OllamaBackendClient()
                names = client.list_available_models()
                assert names == []


class TestVLLMBackendClient:
    def test_preload_models_is_noop(self):
        client = VLLMBackendClient()
        assert client.preload_models(["model1", "model2"]) == []

    def test_get_vram_usage_returns_none(self):
        client = VLLMBackendClient()
        assert client.get_vram_usage() is None

    def test_get_context_window_success(self):
        json_data = {
            "data": [
                {"id": "qwen2.5-coder:7b", "root": {"context_length": 32768}},
                {"id": "llama3:8b", "root": {"context_length": 8192}},
            ]
        }
        with patch("bright_vision_core.llm_backends.vllm_client.httpx.Client") as MockClient:
            resp = _mock_response(json_data=json_data)
            MockClient.return_value.__enter__.return_value.get.return_value = resp
            client = VLLMBackendClient()
            ctx = client.get_context_window("qwen2.5-coder:7b")
            assert ctx == 32768

    def test_get_context_window_not_found(self):
        json_data = {"data": [{"id": "other-model", "root": {"context_length": 8192}}]}
        with patch("bright_vision_core.llm_backends.vllm_client.httpx.Client") as MockClient:
            resp = _mock_response(json_data=json_data)
            MockClient.return_value.__enter__.return_value.get.return_value = resp
            client = VLLMBackendClient()
            ctx = client.get_context_window("qwen2.5-coder:7b")
            assert ctx is None

    def test_list_available_models_success(self):
        json_data = {"data": [{"id": "qwen2.5-coder:7b"}, {"id": "llama3:8b"}]}
        with patch("bright_vision_core.llm_backends.vllm_client.httpx.Client") as MockClient:
            resp = _mock_response(json_data=json_data)
            MockClient.return_value.__enter__.return_value.get.return_value = resp
            client = VLLMBackendClient()
            names = client.list_available_models()
            assert names == ["qwen2.5-coder:7b", "llama3:8b"]

    def test_list_available_models_unreachable(self, caplog):
        with patch("bright_vision_core.llm_backends.vllm_client.httpx.Client") as MockClient:
            MockClient.return_value.__enter__.side_effect = httpx.ConnectError("connection refused")
            with caplog.at_level(logging.ERROR):
                client = VLLMBackendClient()
                names = client.list_available_models()
                assert names == []


class TestLlamaCppBackendClient:
    def test_preload_models_is_noop(self):
        client = LlamaCppBackendClient()
        assert client.preload_models(["model1"]) == []

    def test_get_vram_usage_returns_none(self):
        client = LlamaCppBackendClient()
        assert client.get_vram_usage() is None

    def test_get_context_window_returns_none(self):
        client = LlamaCppBackendClient()
        assert client.get_context_window("model1") is None

    def test_list_available_models_returns_empty(self):
        client = LlamaCppBackendClient()
        assert client.list_available_models() == []


class TestProtocolCompliance:
    @pytest.mark.parametrize("backend", [
        OllamaBackendClient,
        VLLMBackendClient,
        LlamaCppBackendClient,
    ])
    def test_all_clients_satisfy_protocol(self, backend):
        client = backend()
        assert callable(client.preload_models)
        assert callable(client.get_vram_usage)
        assert callable(client.get_context_window)
        assert callable(client.list_available_models)