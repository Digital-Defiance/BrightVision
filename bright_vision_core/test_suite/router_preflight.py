"""Router e2e lane requires explicit fast + heavy Ollama tags (not 3b-only fallback)."""

from __future__ import annotations

import os
from pathlib import Path

from bright_vision_core.test_suite.timing import repo_root


def _load_local_llm_env() -> dict[str, str]:
    root = repo_root()
    paths = [
        root / "local-llm.env",
        Path(os.environ.get("LOCAL_LLM_ENV", "")).expanduser(),
    ]
    out: dict[str, str] = {}
    for path in paths:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            trimmed = line.strip()
            if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
                continue
            key, _, value = trimmed.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                out[key] = value
    return out


def _normalize_tag(raw: str) -> str:
    v = (raw or "").strip()
    if v.startswith("ollama_chat/"):
        return v[len("ollama_chat/") :]
    if v.startswith("ollama/"):
        return v[len("ollama/") :]
    return v


def resolve_router_tags() -> tuple[str, str]:
    file_env = _load_local_llm_env()
    fast = _normalize_tag(
        os.environ.get("E2E_FAST_MODEL", "")
        or os.environ.get("FAST_MODEL", "")
        or file_env.get("FAST_MODEL", "")
    )
    heavy = _normalize_tag(
        os.environ.get("E2E_HEAVY_MODEL", "")
        or os.environ.get("HEAVY_MODEL", "")
        or file_env.get("HEAVY_MODEL", "")
    )
    return fast, heavy


def router_lane_ready() -> tuple[bool, str]:
    """Suite bar: distinct fast and heavy tags (see docs/TESTING.md)."""
    fast, heavy = resolve_router_tags()
    if not fast:
        return (
            False,
            "Router e2e requires FAST_MODEL (or E2E_FAST_MODEL) in local-llm.env — "
            "e.g. qwen2.5-coder:7b. Falling back to llama3.2:3b alone is not a router test.",
        )
    if not heavy:
        return (
            False,
            "Router e2e requires HEAVY_MODEL (or E2E_HEAVY_MODEL) in local-llm.env — "
            "e.g. qwen3.6:27b-q4_K_M. Do not rely on E2E_OLLAMA_MODEL for the heavy tier.",
        )
    if fast == heavy:
        return (
            False,
            f"Router e2e requires different fast and heavy models (both are {fast!r}).",
        )
    return True, f"fast={fast} heavy={heavy}"
