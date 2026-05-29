"""User-facing progress copy for LLM waits (Ollama vs cloud providers)."""

from __future__ import annotations

from typing import Any


def _short_model_name(name: str) -> str:
    n = name.strip()
    for prefix in ("ollama_chat/", "ollama/"):
        if n.startswith(prefix):
            return n[len(prefix) :]
    return n


def llm_wait_messages(model: Any) -> tuple[str, str]:
    """
    Return (initial_progress_message, heartbeat_base).

    Heartbeat base is suffixed with `` (Ns)`` in :func:`iterate_async_with_heartbeats`.
    """
    short = _short_model_name(getattr(model, "name", "") or "model")
    if getattr(model, "is_ollama", lambda: False)():
        return (
            f"Waiting for Ollama ({short})…",
            f"Waiting for Ollama ({short})",
        )
    full = (getattr(model, "name", None) or short).strip()
    return (
        f"Waiting for cloud LLM ({full})…",
        f"Waiting for cloud LLM ({full})",
    )
