"""Tests for backend clients — protocol compliance, mock HTTP, error logging, no-ops."""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from bright_vision_core.llm_backends.llamacpp_client import LlamaCppBackendClient
from bright_vision_core.llm_backends.lmstudio_client import LmStudioBackendClient
from bright_vision_core.llm_backends.ollama_client import OllamaBackendClient
from bright_vision_core.llm_backends.vllm_client import VLLMBackendClient


def _mock_response(status_code: int = 200, json_data: dict | list | None = None) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    resp.raise_for_status.return_value = None
    return resp


def _async_client_patch(module: str):
    """Patch httpx.AsyncClient used by backend clients (not sync Client)."""
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    return patch(f"{module}.httpx.AsyncClient", return_value=mock_client), mock_client


class TestOllamaBackendClient:
    @pytest.mark.asyncio
    async def test_preload_models_success(self):
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.ollama_client")
        with patcher:
            mock_client.post.return_value = _mock_response(json_data={"status": "success"})
            client = OllamaBackendClient(host="http://mock-ollama:11434")
            loaded = await client.preload_models(["qwen2.5-coder:7b"])
            assert loaded == ["qwen2.5-coder:7b"]

    @pytest.mark.asyncio
    async def test_preload_models_timeout_logs_error(self, caplog):
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.ollama_client")
        with patcher:
            mock_client.post.side_effect = httpx.TimeoutException("timed out")
            with caplog.at_level(logging.ERROR):
                client = OllamaBackendClient(host="http://mock-ollama:11434")
                loaded = await client.preload_models(["qwen2.5-coder:7b"])
                assert loaded == []
                assert any("failed to preload" in r.message for r in caplog.records)

    @pytest.mark.asyncio
    async def test_get_vram_usage_success(self):
        json_data = {
            "models": [
                {"name": "qwen2.5-coder:7b", "size_vram": 4800 * 1024 * 1024},
                {"name": "llama3:8b", "size_vram": 8 * 1024 * 1024},
            ]
        }
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.ollama_client")
        with patcher:
            mock_client.get.return_value = _mock_response(json_data=json_data)
            client = OllamaBackendClient(host="http://mock-ollama:11434")
            vram = await client.get_vram_usage()
            assert vram == 4808

    @pytest.mark.asyncio
    async def test_get_vram_usage_unreachable(self, caplog):
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.ollama_client")
        with patcher:
            mock_client.get.side_effect = httpx.ConnectError("connection refused")
            with caplog.at_level(logging.ERROR):
                client = OllamaBackendClient(host="http://mock-ollama:11434")
                vram = await client.get_vram_usage()
                assert vram is None

    @pytest.mark.asyncio
    async def test_get_context_window_success(self):
        json_data = {"models": [{"name": "qwen2.5-coder:7b", "details": {"context_length": 32768}}]}
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.ollama_client")
        with patcher:
            mock_client.get.return_value = _mock_response(json_data=json_data)
            client = OllamaBackendClient(host="http://mock-ollama:11434")
            ctx = await client.get_context_window("qwen2.5-coder:7b")
            assert ctx == 32768

    @pytest.mark.asyncio
    async def test_get_context_window_not_found(self):
        json_data = {"models": [{"name": "other-model", "details": {"context_length": 8192}}]}
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.ollama_client")
        with patcher:
            mock_client.get.return_value = _mock_response(json_data=json_data)
            client = OllamaBackendClient(host="http://mock-ollama:11434")
            ctx = await client.get_context_window("qwen2.5-coder:7b")
            assert ctx is None

    @pytest.mark.asyncio
    async def test_list_available_models_success(self):
        json_data = {"models": [{"name": "qwen2.5-coder:7b"}, {"name": "llama3:8b"}]}
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.ollama_client")
        with patcher:
            mock_client.get.return_value = _mock_response(json_data=json_data)
            client = OllamaBackendClient(host="http://mock-ollama:11434")
            names = await client.list_available_models()
            assert names == ["qwen2.5-coder:7b", "llama3:8b"]

    @pytest.mark.asyncio
    async def test_list_available_models_empty(self):
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.ollama_client")
        with patcher:
            mock_client.get.return_value = _mock_response(json_data={"models": []})
            client = OllamaBackendClient(host="http://mock-ollama:11434")
            names = await client.list_available_models()
            assert names == []

    @pytest.mark.asyncio
    async def test_list_available_models_unreachable(self, caplog):
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.ollama_client")
        with patcher:
            mock_client.get.side_effect = httpx.ConnectError("connection refused")
            with caplog.at_level(logging.ERROR):
                client = OllamaBackendClient(host="http://mock-ollama:11434")
                names = await client.list_available_models()
                assert names == []


class TestVLLMBackendClient:
    @pytest.mark.asyncio
    async def test_preload_models_is_noop(self):
        client = VLLMBackendClient()
        assert await client.preload_models(["model1", "model2"]) == []

    @pytest.mark.asyncio
    async def test_get_vram_usage_returns_none(self):
        client = VLLMBackendClient()
        assert await client.get_vram_usage() is None

    @pytest.mark.asyncio
    async def test_get_context_window_success(self):
        json_data = {
            "data": [
                {"id": "qwen2.5-coder:7b", "root": {"context_length": 32768}},
                {"id": "llama3:8b", "root": {"context_length": 8192}},
            ]
        }
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.vllm_client")
        with patcher:
            mock_client.get.return_value = _mock_response(json_data=json_data)
            client = VLLMBackendClient(host="http://mock-vllm:8000")
            ctx = await client.get_context_window("qwen2.5-coder:7b")
            assert ctx == 32768

    @pytest.mark.asyncio
    async def test_get_context_window_not_found(self):
        json_data = {"data": [{"id": "other-model", "root": {"context_length": 8192}}]}
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.vllm_client")
        with patcher:
            mock_client.get.return_value = _mock_response(json_data=json_data)
            client = VLLMBackendClient(host="http://mock-vllm:8000")
            ctx = await client.get_context_window("qwen2.5-coder:7b")
            assert ctx is None

    @pytest.mark.asyncio
    async def test_list_available_models_success(self):
        json_data = {"data": [{"id": "qwen2.5-coder:7b"}, {"id": "llama3:8b"}]}
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.vllm_client")
        with patcher:
            mock_client.get.return_value = _mock_response(json_data=json_data)
            client = VLLMBackendClient(host="http://mock-vllm:8000")
            names = await client.list_available_models()
            assert names == ["qwen2.5-coder:7b", "llama3:8b"]

    @pytest.mark.asyncio
    async def test_list_available_models_unreachable(self, caplog):
        patcher, mock_client = _async_client_patch("bright_vision_core.llm_backends.vllm_client")
        with patcher:
            mock_client.get.side_effect = httpx.ConnectError("connection refused")
            with caplog.at_level(logging.ERROR):
                client = VLLMBackendClient(host="http://mock-vllm:8000")
                names = await client.list_available_models()
                assert names == []


class TestLlamaCppBackendClient:
    @pytest.mark.asyncio
    async def test_preload_models_is_noop(self):
        client = LlamaCppBackendClient()
        assert await client.preload_models(["model1"]) == []

    @pytest.mark.asyncio
    async def test_get_vram_usage_returns_none(self):
        client = LlamaCppBackendClient()
        assert await client.get_vram_usage() is None

    @pytest.mark.asyncio
    async def test_get_context_window_returns_none(self):
        client = LlamaCppBackendClient()
        assert await client.get_context_window("model1") is None

    @pytest.mark.asyncio
    async def test_list_available_models_returns_empty(self):
        client = LlamaCppBackendClient()
        assert await client.list_available_models() == []


class TestLmStudioBackendClient:
    @pytest.mark.asyncio
    async def test_list_available_models_from_lms_json(self):
        payload = [
            {"type": "llm", "modelKey": "qwen2.5-coder-7b-instruct"},
            {"type": "embedding", "modelKey": "text-embedding-nomic-embed-text-v1.5"},
        ]
        with patch(
            "bright_vision_core.llm_backends.lmstudio_client._run_lms_json",
            new=AsyncMock(return_value=payload),
        ):
            client = LmStudioBackendClient()
            names = await client.list_available_models()
            assert names == ["qwen2.5-coder-7b-instruct"]

    @pytest.mark.asyncio
    async def test_get_context_window_from_lms_json(self):
        payload = [
            {"type": "llm", "modelKey": "llama-3.2-3b-instruct", "maxContextLength": 131072},
        ]
        with patch(
            "bright_vision_core.llm_backends.lmstudio_client._run_lms_json",
            new=AsyncMock(return_value=payload),
        ):
            client = LmStudioBackendClient()
            ctx = await client.get_context_window("openai/llama-3.2-3b-instruct")
            assert ctx == 131072

    @pytest.mark.asyncio
    async def test_preload_models_calls_lms_load(self):
        with patch(
            "bright_vision_core.llm_backends.lmstudio_client._lms_path",
            return_value="/usr/bin/lms",
        ), patch(
            "bright_vision_core.llm_backends.lmstudio_client.asyncio.create_subprocess_exec",
            new=AsyncMock(),
        ) as mock_exec:
            proc = AsyncMock()
            proc.communicate.return_value = (b"", b"")
            proc.returncode = 0
            mock_exec.return_value = proc
            client = LmStudioBackendClient()
            loaded = await client.preload_models(["qwen/qwen3.6-27b"])
            assert loaded == ["qwen/qwen3.6-27b"]
            mock_exec.assert_called_once()
            args = mock_exec.call_args.args
            assert args[0] == "/usr/bin/lms"
            assert args[1] == "load"
            assert args[2] == "qwen/qwen3.6-27b"
            assert "-y" in args
            assert "--identifier" in args
            assert "qwen/qwen3.6-27b" in args


class TestProtocolCompliance:
    @pytest.mark.parametrize(
        "backend",
        [OllamaBackendClient, LmStudioBackendClient, VLLMBackendClient, LlamaCppBackendClient],
    )
    def test_all_clients_satisfy_protocol(self, backend):
        client = backend()
        assert callable(client.preload_models)
        assert callable(client.get_vram_usage)
        assert callable(client.get_context_window)
        assert callable(client.list_available_models)
