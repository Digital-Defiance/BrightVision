"""Backend registry — singleton that resolves and caches the active BackendClient."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from bright_vision_core.llm_backends.base import BackendClient
from bright_vision_core.llm_backends.config import resolve_backend_config

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class _Registry:
    """Singleton backend registry."""

    def __init__(self) -> None:
        self._active_name: str | None = None
        self._client: BackendClient | None = None
        self._clients: dict[str, type[BackendClient]] = {}

    # -- Public API -----------------------------------------------------------

    def get_active(self) -> BackendClient:
        """Return the active backend client. Lazily instantiates from config."""
        if self._client is None:
            cfg = resolve_backend_config()
            self.set_active(cfg["active_backend"])
        assert self._client is not None  # set_active always sets it
        return self._client

    def set_active(self, name: str) -> None:
        """Switch the active backend to *name*. Instantiates and caches it."""
        self._active_name = name
        client = self._clients.get(name)(host=self._get_host_for(name))
        self._client = client

    def register(self, name: str, client_cls: type[BackendClient]) -> None:
        """Register a backend implementation class under *name*."""
        self._clients[name] = client_cls

    def clear(self) -> None:
        """Reset the registry (useful for testing)."""
        self._active_name = None
        self._client = None

    # -- Internal helpers -----------------------------------------------------

    def _get_host_for(self, name: str) -> str:
        """Return the host URL for a backend name."""
        cfg = resolve_backend_config()
        return cfg["backend_url"]


# Module-level singleton
BackendRegistry = _Registry()

# Register built-in backends by default
from bright_vision_core.llm_backends.ollama_client import OllamaBackendClient  # noqa: E402, I001
from bright_vision_core.llm_backends.vllm_client import VLLMBackendClient  # noqa: E402, I001
from bright_vision_core.llm_backends.llamacpp_client import LlamaCppBackendClient  # noqa: E402, I001

BackendRegistry.register("ollama", OllamaBackendClient)
BackendRegistry.register("vllm", VLLMBackendClient)
BackendRegistry.register("llamacpp", LlamaCppBackendClient)