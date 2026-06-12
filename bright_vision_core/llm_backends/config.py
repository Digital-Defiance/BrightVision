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

Resolves the active backend from:
1. BRIGHTVISION_LLM_BACKEND environment variable (highest priority)
2. Persisted config at ~/.config/brightvision/config.json
3. Default: "ollama"

Validates against allowed set {ollama, llamacpp, vllm, tgi, mlx-lm} and checks
platform compatibility (mlx-lm requires macOS).
"""  
from __future__ import annotations

import json
import logging
import os
import platform
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

ALLOWED_BACKENDS: frozenset[str] = frozenset({"ollama", "llamacpp", "vllm", "tgi", "mlx-lm"})
CONFIG_DIR: Path = Path.home() / ".config" / "brightvision"
CONFIG_FILE: Path = CONFIG_DIR / "config.json"

# Platform-specific restrictions
_PLATFORM_RESTRICTIONS: dict[str, set[str]] = {
    "darwin": {"mlx-lm"},
}


def _is_platform_supported(backend: str) -> bool:
    """Check if backend is supported on the current platform."""
    system = platform.system().lower()
    restricted = _PLATFORM_RESTRICTIONS.get(system, set())
    return backend not in restricted


def resolve_backend_config() -> dict[str, Any]:
    """Resolve active backend configuration.

    Priority:
    1. BRIGHTVISION_LLM_BACKEND env var
    2. Persisted config file (~/.config/brightvision/config.json)
    3. Default: {"active_backend": "ollama", "backend_url": "http://localhost:11434"}

    Returns:
        Dict with keys: active_backend, backend_url, platform_supported
    """
    # Priority 1: environment variable
    env_backend = os.environ.get("BRIGHTVISION_LLM_BACKEND")
    if env_backend:
        return _resolve_from_env(env_backend)

    # Priority 2: persisted config
    persisted = _load_persisted_config()
    if persisted and "active_backend" in persisted:
        backend = persisted["active_backend"]
        if backend not in ALLOWED_BACKENDS:
            logger.warning("Invalid backend '%s' in config, falling back to ollama", backend)
            return _default_config()
        supported = _is_platform_supported(backend)
        result = {
            "active_backend": backend,
            "backend_url": persisted.get("backend_url", "http://localhost:11434"),
            "platform_supported": supported,
            "user_vram_override_mb": persisted.get("user_vram_override_mb"),
        }
        return result

    # Priority 3: default
    return _default_config()


def _resolve_from_env(env_backend: str) -> dict[str, Any]:
    """Resolve config from environment variable."""
    if env_backend not in ALLOWED_BACKENDS:
        logger.warning("Invalid backend '%s' from env, falling back to ollama", env_backend)
        return _default_config()
    supported = _is_platform_supported(env_backend)
    result = {
        "active_backend": env_backend,
        "backend_url": os.environ.get("BRIGHTVISION_BACKEND_URL", "http://localhost:11434"),
        "platform_supported": supported,
    }
    return result


def _load_persisted_config() -> dict[str, Any] | None:
    """Load persisted config from disk."""
    try:
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to load persisted config: %s", e)
    return None


def _default_config() -> dict[str, Any]:
    """Return default configuration."""
    return {
        "active_backend": "ollama",
        "backend_url": "http://localhost:11434",
        "platform_supported": True,
    }


def persist_backend_config(config: dict[str, Any]) -> None:
    """Persist backend configuration to disk."""
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
    except OSError as e:
        logger.warning("Failed to persist config: %s", e)