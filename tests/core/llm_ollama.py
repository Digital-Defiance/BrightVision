"""Shared Ollama setup for E2E_LLM=1 pytest (mirrors e2e/helpers/llmEnv.ts)."""

from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.request

DEFAULT_E2E_OLLAMA_MODEL = "ollama_chat/llama3.2:3b"
DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434"


def _ollama_host() -> str:
    return (
        os.environ.get("E2E_OLLAMA_HOST")
        or os.environ.get("OLLAMA_HOST")
        or DEFAULT_OLLAMA_HOST
    ).rstrip("/")


def _auto_pull_enabled() -> bool:
    v = (os.environ.get("E2E_OLLAMA_AUTO_PULL") or "").strip().lower()
    return v not in ("0", "false", "no")


def _strip_ollama_prefix(model: str) -> str:
    m = model.strip()
    if m.startswith("ollama_chat/"):
        return m[len("ollama_chat/") :]
    if m.startswith("ollama/"):
        return m[len("ollama/") :]
    return m


def resolve_ollama_tag() -> str:
    explicit = (os.environ.get("E2E_OLLAMA_MODEL") or "").strip()
    if explicit:
        return _strip_ollama_prefix(explicit)
    for key in ("DATA_MODEL", "LLM_MODEL", "CHAT_MODEL"):
        raw = (os.environ.get(key) or "").strip()
        if raw:
            return _strip_ollama_prefix(raw)
    return _strip_ollama_prefix(DEFAULT_E2E_OLLAMA_MODEL)


def vision_model_from_tag(tag: str) -> str:
    from llm_model_resolve import normalize_vision_model_for_e2e

    return normalize_vision_model_for_e2e(tag)


def resolve_vision_model() -> str:
    explicit = (
        os.environ.get("E2E_VISION_MODEL") or os.environ.get("E2E_OLLAMA_MODEL") or ""
    ).strip()
    if explicit:
        return vision_model_from_tag(explicit)
    return vision_model_from_tag(resolve_ollama_tag())


def fetch_ollama_tag_names(host: str | None = None) -> list[str]:
    base = host or _ollama_host()
    req = urllib.request.Request(f"{base}/api/tags")
    with urllib.request.urlopen(req, timeout=15) as res:
        body = json.loads(res.read().decode("utf-8"))
    names: list[str] = []
    for entry in body.get("models") or []:
        for key in ("name", "model"):
            val = entry.get(key)
            if isinstance(val, str) and val:
                names.append(val)
    return names


def is_tag_pulled(names: list[str], tag: str) -> bool:
    return any(n == tag or n.startswith(f"{tag}:") for n in names)


def ollama_pull(tag: str) -> None:
    print(f"[llm e2e] ollama pull {tag}…", flush=True)
    subprocess.run(["ollama", "pull", tag], check=True)


def ensure_ollama_model_pulled(tag: str | None = None) -> str:
    """Return resolved tag; pull with `ollama pull` when missing (unless E2E_OLLAMA_AUTO_PULL=0)."""
    resolved = tag or resolve_ollama_tag()
    host = _ollama_host()
    names = fetch_ollama_tag_names(host)
    if is_tag_pulled(names, resolved):
        return resolved
    if not _auto_pull_enabled():
        raise RuntimeError(
            f'Model "{resolved}" is not pulled. Run: ollama pull {resolved}\n'
            f"Or set E2E_OLLAMA_AUTO_PULL=1 (default) to pull automatically."
        )
    ollama_pull(resolved)
    names = fetch_ollama_tag_names(host)
    if not is_tag_pulled(names, resolved):
        raise RuntimeError(
            f'ollama pull {resolved} finished but model still missing from /api/tags'
        )
    return resolved


def ensure_ollama_for_llm_e2e() -> str:
    host = _ollama_host()
    try:
        fetch_ollama_tag_names(host)
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        raise RuntimeError(
            f"Ollama not reachable at {host} ({err}). Install Ollama and run: ollama serve"
        ) from err
    return ensure_ollama_model_pulled()


def ollama_reachable() -> bool:
    try:
        fetch_ollama_tag_names()
        return True
    except (urllib.error.URLError, TimeoutError, OSError):
        return False
