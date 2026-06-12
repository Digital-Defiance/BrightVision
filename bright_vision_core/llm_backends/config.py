"""Backend configuration resolver for BrightVision LLM backends.

Resolves the active backend from environment variables, persisted config,
or defaults to ``ollama``.  Validates against an allowed set and checks
platform compatibility at resolution time.
"""

from __future__ import annotations

import json
import logging
import os
import platform
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

ALLOWED_BACKENDS: frozenset[str] = frozenset(
    ["ollama", "llamacpp", "vllm", "tgi", "mlx-lm"]
)

# Platforms where certain backends are not supported.
UNSUPPORTED_PLATFORMS: dict[str, set[str]] = {
    # mlx-lm requires macOS (Apple Silicon or Intel with XPU support).
    "darwin": set(),  # all backends supported on macOS
    "linux": {"mlx-lm"},
    "win32": {"llamacpp", "vllm", "tgi", "mlx-lm"},  # only ollama works reliably
}

_CONFIG_DIR = Path.home() / ".config" / "brightvision"
_CONFIG_FILE = _CONFIG_DIR / "config.json"


def resolve_backend_config() -> dict[str, Any]:
    """Resolve the active backend configuration.

    Resolution hierarchy:
        1. ``BRIGHTVISION_LLM_BACKEND`` environment variable.
        2. Persisted config at ``~/.config/brightvision/config.json``.
        3. Default to ``"ollama"``.

    Returns a dict with keys: ``active_backend``, ``backend_url``,
    ``platform_supported``, and ``user_vram_override_mb``.
    """
    # 1. Environment variable takes highest priority.
    env_backend = os.environ.get("BRIGHTVISION_LLM_BACKEND", "").strip()
    if env_backend:
        backend, supported = _validate_and_check_platform(env_backend)
        if not supported:
            logger.warning(
                "Backend '%s' is not supported on this platform (%s). "
                "Falling back to 'ollama'.",
                env_backend,
                platform.system(),
            )
            default_config = _default_config()
            return {**default_config, "active_backend": "ollama"}
        return {
            "active_backend": backend,
            "backend_url": os.environ.get("BRIGHTVISION_LLM_BACKEND_URL", ""),
            "platform_supported": True,
            "user_vram_override_mb": None,
        }

    # 2. Persisted config.
    persisted = _load_persisted_config()
    if persisted and "active_backend" in persisted:
        backend = persisted["active_backend"]
        validated, supported = _validate_and_check_platform(backend)
        if not supported:
            logger.warning(
                "Persisted backend '%s' is not supported on this platform (%s). "
                "Falling back to 'ollama'.",
                backend,
                platform.system(),
            )
            return _default_config()
        return {
            "active_backend": validated,
            "backend_url": persisted.get("backend_url", ""),
            "platform_supported": True,
            "user_vram_override_mb": persisted.get("user_vram_override_mb"),
        }
    # 3. Default.
    return _default_config()


def _validate_and_check_platform(
    backend: str,
) -> tuple[str, bool]:
    """Validate backend name and check platform compatibility.

    Returns ``(validated_backend, is_supported)``.
    """
    if backend not in ALLOWED_BACKENDS:
        logger.warning(
            "Invalid backend '%s'. Allowed backends: %s. Defaulting to 'ollama'.",
            backend,
            sorted(ALLOWED_BACKENDS),
        )
        return "ollama", True

    system = platform.system().lower()
    unsupported = UNSUPPORTED_PLATFORMS.get(system, set())
    if backend in unsupported:
        return backend, False

    return backend, True


def _default_config() -> dict[str, Any]:
    """Return the default configuration (ollama)."""
    return {
        "active_backend": "ollama",
        "backend_url": "http://localhost:11434",
        "platform_supported": True,
        "user_vram_override_mb": None,
    }


def _load_persisted_config() -> dict[str, Any] | None:
    """Load persisted config from disk. Returns ``None`` if file doesn't exist."""
    if not _CONFIG_FILE.is_file():
        return None
    try:
        with open(_CONFIG_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            return data
        logger.warning("Persisted config is not a JSON object.")
        return None
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load persisted config: %s", exc)
        return None


def persist_backend_config(config: dict[str, Any]) -> Path:
    """Persist the backend configuration to disk.

    Returns the path where the config was written.
    """
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(_CONFIG_FILE, "w", encoding="utf-8") as fh:
        json.dump(config, fh, indent=2)
    return _CONFIG_FILE


def get_allowed_backends() -> frozenset[str]:
    """Return the set of allowed backend names."""
    return ALLOWED_BACKENDS