"""llama.cpp backend client — implements BackendClient via llama.cpp HTTP API."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

LLAMACPP_DEFAULT_HOST = "http://localhost:8080"


class LlamaCppBackendClient:
    """Backend client for the llama.cpp HTTP server.

    All lifecycle operations are best-effort no-ops because llama.cpp does not
    expose model-pull, VRAM-query, or context-window endpoints over HTTP.
    The caller should rely on the static metadata registry for fallback values.
    """

    def __init__(self, host: str = LLAMACPP_DEFAULT_HOST) -> None:
        self._host = host.rstrip("/")

    # -- BackendClient protocol ---------------------------------------------

    def preload_models(self, models: list[str]) -> list[str]:
        """llama.cpp has no preload API — no-op. Returns empty list."""
        return []

    def get_vram_usage(self) -> int | None:
        """llama.cpp does not expose a VRAM query endpoint.  Returns ``None``."""
        return None

    def get_context_window(self, model: str) -> int | None:
        """llama.cpp does not expose a context-window endpoint.  Returns ``None``."""
        return None

    def list_available_models(self) -> list[str]:
        """llama.cpp has no model-listing endpoint.  Returns empty list."""
        return []