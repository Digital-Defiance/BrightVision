"""Resolve cecli session encryption across pin layouts.

Upstream merged PR #533 as ``cecli.helpers.crypto`` (v0.100.2+), not a top-level
``cecli.session_crypto`` export. Older integration branches used
``cecli/session_crypto.py``. BrightVision accepts either; returns ``None`` when
encryption is not present in the pinned cecli (v0.100.1).
"""

from __future__ import annotations

from types import ModuleType
from typing import Any


def session_crypto_module() -> ModuleType | None:
    """Return the cecli session crypto module, or ``None`` if unavailable."""
    try:
        from cecli.helpers import crypto

        return crypto
    except ImportError:
        pass
    try:
        from cecli import session_crypto

        return session_crypto
    except ImportError:
        return None


def require_session_crypto_module() -> ModuleType:
    """Return session crypto module or raise with upgrade instructions."""
    mod = session_crypto_module()
    if mod is not None:
        return mod
    raise ImportError(
        "Session encryption requires cecli v0.100.2+ (cecli.helpers.crypto). "
        "Update the cecli submodule to cecli-dev main and reinstall: "
        "cd cecli && git fetch upstream main && git checkout upstream/main && "
        "cd .. && pip install -e cecli"
    )


def session_crypto_available() -> bool:
    return session_crypto_module() is not None


def resolve_key(*, key_file: str | None = None) -> bytes | None:
    mod = session_crypto_module()
    if mod is None:
        return None
    return mod.resolve_key(key_file=key_file)


def __getattr__(name: str) -> Any:
    return getattr(require_session_crypto_module(), name)
