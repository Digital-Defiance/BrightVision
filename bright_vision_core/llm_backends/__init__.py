"""BrightVision LLM backends — protocol, registry, and config."""

from __future__ import annotations

from bright_vision_core.llm_backends.base import BackendClient
from bright_vision_core.llm_backends.config import resolve_backend_config
from bright_vision_core.llm_backends.metadata_resolver import resolve_static_metadata
from bright_vision_core.llm_backends.registry import BackendRegistry

__all__ = [
    "BackendClient",
    "BackendRegistry",
    "resolve_backend_config",
    "resolve_static_metadata",
]