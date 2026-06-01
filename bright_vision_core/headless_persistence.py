"""Map Vision / BrightVision session persistence options onto cecli headless args."""

from __future__ import annotations

import os
from types import SimpleNamespace


def apply_persistence_to_args(
    args: SimpleNamespace,
    *,
    session_encrypt: bool = False,
    session_key_file: str | None = None,
    auto_save: bool = False,
    auto_load: bool = False,
    auto_save_session_name: str = "auto-save",
) -> SimpleNamespace:
    """Return a copy of *args* with persistence fields set (does not mutate *args*)."""
    out = SimpleNamespace(**vars(args))
    out.session_encrypt = bool(session_encrypt)
    out.session_key_file = session_key_file
    out.auto_save = bool(auto_save)
    out.auto_load = bool(auto_load)
    out.auto_save_session_name = auto_save_session_name or "auto-save"
    if out.session_encrypt and not session_crypto_key_available(session_key_file):
        out.session_encrypt = False
    return out


def session_crypto_key_available(session_key_file: str | None = None) -> bool:
    from cecli import session_crypto

    return session_crypto.resolve_key(key_file=session_key_file) is not None


def persistence_env_active() -> bool:
    return bool(os.environ.get("CECLI_SESSION_KEY", "").strip())
