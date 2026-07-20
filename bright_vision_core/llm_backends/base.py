"""Abstract backend protocol for BrightVision LLM backends.

This module defines the ``BackendClient`` Protocol that all backend implementations
MUST satisfy. It decouples model lifecycle operations (pull, preload, VRAM query)
from the inference API layer so new runtimes can be added without touching core logic.
"""

from __future__ import annotations

from typing import Protocol


class BackendClient(Protocol):
    """Protocol that every LLM backend client must implement."""

    async def preload_models(self, models: list[str]) -> list[str]: ...

    async def get_vram_usage(self) -> int | None: ...

    async def get_context_window(self, model: str) -> int | None: ...

    async def list_available_models(self) -> list[str]: ...