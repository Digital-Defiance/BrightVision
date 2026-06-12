"""Ollama backend client — implements BackendClient via Ollama HTTP API."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

OLLAMA_DEFAULT_HOST = "http://localhost:11434"


class OllamaBackendClient:
    """Backend client for the Ollama runtime.

    Calls Ollama's HTTP API for model lifecycle operations.  All public methods
    wrap their calls in try/except and log ERROR on failure — they never raise.
    """

    def __init__(self, host: str = OLLAMA_DEFAULT_HOST) -> None:
        self._host = host.rstrip("/")

    # -- BackendClient protocol ---------------------------------------------

    def preload_models(self, models: list[str]) -> list[str]:
        """Preload models by sending a zero-token generate request with keep_alive.

        Returns the subset of *models* that were successfully preloaded.
        """
        loaded: list[str] = []
        for model in models:
            try:
                with httpx.Client(timeout=30) as client:
                    client.post(
                        f"{self._host}/api/generate",
                        json={
                            "model": model,
                            "prompt": "",
                            "stream": False,
                            "keep_alive": 0,  # keep in memory indefinitely
                        },
                    )
                loaded.append(model)
            except Exception:  # noqa: BLE001
                logger.error(
                    "OllamaBackendClient: failed to preload model '%s'", model, exc_info=True,
                )
        return loaded

    def get_vram_usage(self) -> int | None:
        """Return total VRAM used (MB) across all loaded models via /api/ps.

        Returns ``None`` when the API is unreachable or the response is malformed.
        """
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.get(f"{self._host}/api/ps")
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()
                total_mb = 0
                for model in data.get("models", []):
                    vram = model.get("size_vram", 0)
                    if isinstance(vram, (int, float)):
                        total_mb += int(vram) // (1024 * 1024)
                return total_mb
        except Exception:  # noqa: BLE001
            logger.error("OllamaBackendClient: get_vram_usage failed", exc_info=True)
            return None

    def get_context_window(self, model: str) -> int | None:
        """Return the context window of *model* from /api/tags.

        Falls back to ``None`` when the model is not found or the API is unreachable.
        The caller should consult the static metadata registry for a default value.
        """
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.get(f"{self._host}/api/tags")
                resp.raise_for_status()
                models: list[dict[str, Any]] = resp.json().get("models", [])
                for m in models:
                    if m.get("name", "").startswith(model):
                        return int(m.get("details", {}).get("context_length", 0))
                return None
        except Exception:  # noqa: BLE001
            logger.error("OllamaBackendClient: get_context_window failed for '%s'", model, exc_info=True)
            return None

    def list_available_models(self) -> list[str]:
        """Return a list of available model names from /api/tags."""
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.get(f"{self._host}/api/tags")
                resp.raise_for_status()
                models: list[dict[str, Any]] = resp.json().get("models", [])
                return [m.get("name", "") for m in models if m.get("name")]
        except Exception:  # noqa: BLE001
            logger.error("OllamaBackendClient: list_available_models failed", exc_info=True)
            return []