"""vLLM backend client — implements BackendClient via vLLM OpenAI-compatible API."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from bright_vision_core.llm_backends.base import BackendClient

logger = logging.getLogger(__name__)

VLLM_DEFAULT_HOST = "http://localhost:8000"


class VLLMBackendClient(BackendClient):
    """Backend client for the vLLM runtime.

    Preload is a no-op (vLLM loads models on startup).  VRAM query returns None.
    Model listing hits ``/v1/models`` best-effort.
    """

    def __init__(self, host: str = VLLM_DEFAULT_HOST) -> None:
        self._host = host.rstrip("/")

    # -- BackendClient protocol ---------------------------------------------

    def preload_models(self, models: list[str]) -> list[str]:
        """vLLM loads models at startup — no-op. Returns empty list."""
        return []

    def get_vram_usage(self) -> int | None:
        """vLLM does not expose a VRAM query endpoint.  Returns ``None``."""
        return None

    def get_context_window(self, model: str) -> int | None:
        """Return context window from /v1/models if available, else ``None``."""
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.get(f"{self._host}/v1/models")
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()
                for m in data.get("data", []):
                    if m.get("id", "") == model:
                        return int(m.get("root", {}).get("context_length", 0)) or None
        except Exception:  # noqa: BLE001
            logger.error("VLLMBackendClient: get_context_window failed for '%s'", model, exc_info=True)
        return None

    def list_available_models(self) -> list[str]:
        """Return model names from ``/v1/models``."""
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.get(f"{self._host}/v1/models")
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()
                return [m.get("id", "") for m in data.get("data", []) if m.get("id")]
        except Exception:  # noqa: BLE001
            logger.error("VLLMBackendClient: list_available_models failed", exc_info=True)
            return []