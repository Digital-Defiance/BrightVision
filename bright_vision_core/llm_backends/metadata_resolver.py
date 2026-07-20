"""Static metadata resolver for BrightVision LLM backends.

Loads bundled model metadata from ``metadata.json`` and provides a fallback
dictionary when a model is not found in the registry.

Resolution priority:
    1. User override (``user_override_mb``)
    2. Bundled registry lookup
    3. Defaults (8192 context, 4096 VRAM) with WARN log
"""

from __future__ import annotations

import json
import logging
import pkgutil
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DEFAULT_MAX_CONTEXT = 8192
_DEFAULT_ESTIMATED_VRAM_MB = 4096


def _load_bundled_metadata() -> dict[str, Any]:
    """Load the bundled metadata.json from the package directory."""
    # Try pkgutil first (works when installed as a package)
    raw = pkgutil.get_data(__name__, "metadata.json")
    if raw is not None:
        return json.loads(raw)

    # Fallback: read from disk relative to this file's directory
    _meta_path = Path(__file__).parent / "metadata.json"
    if _meta_path.is_file():
        with open(_meta_path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    logger.warning("Bundled metadata.json not found; all lookups will use defaults.")
    return {"models": {}}


_BUNDLED_REGISTRY: dict[str, Any] | None = None


def _get_registry() -> dict[str, Any]:
    """Return the cached bundled metadata registry."""
    global _BUNDLED_REGISTRY
    if _BUNDLED_REGISTRY is None:
        _BUNDLED_REGISTRY = _load_bundled_metadata()
    return _BUNDLED_REGISTRY


def resolve_static_metadata(
    model_name: str,
    user_override_mb: int | None = None,
) -> dict[str, int]:
    """Resolve static metadata for a model name.

    Returns a dict with ``max_context`` and ``estimated_vram_mb`` (both ints).

    Priority:
        1. User override (applied to estimated_vram_mb only)
        2. Bundled registry lookup
        3. Defaults (8192 / 4096) with a WARN log when the model is unknown
    """
    registry = _get_registry().get("models", {})

    if model_name in registry:
        entry = registry[model_name]
        vram = user_override_mb if user_override_mb is not None else entry.get("estimated_vram_mb", _DEFAULT_ESTIMATED_VRAM_MB)
        return {
            "max_context": int(entry.get("max_context", _DEFAULT_MAX_CONTEXT)),
            "estimated_vram_mb": int(vram),
        }

    # Unknown model — fall back to defaults with a warning.
    logger.warning(
        "Model '%s' not found in metadata registry; using defaults (context=%d, vram=%d MB).",
        model_name,
        _DEFAULT_MAX_CONTEXT,
        _DEFAULT_ESTIMATED_VRAM_MB,
    )
    return {
        "max_context": _DEFAULT_MAX_CONTEXT,
        "estimated_vram_mb": user_override_mb if user_override_mb is not None else _DEFAULT_ESTIMATED_VRAM_MB,
    }