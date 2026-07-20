"""Router e2e lane requires explicit fast + code Ollama tags (think optional)."""

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
    for prefix in ("ollama_chat/", "ollama/", "openai/"):
        if v.startswith(prefix):
            return v[len(prefix) :]
    return v


def _resolve_code_tag(file_env: dict[str, str]) -> str:
    return _normalize_tag(
        os.environ.get("E2E_CODE_MODEL", "")
        or os.environ.get("CODE_MODEL", "")
        or file_env.get("CODE_MODEL", "")
        or os.environ.get("E2E_HEAVY_MODEL", "")
        or os.environ.get("HEAVY_MODEL", "")
        or file_env.get("HEAVY_MODEL", "")
    )


def resolve_router_tags() -> tuple[str, str, str]:
    file_env = _load_local_llm_env()
    fast = _normalize_tag(
        os.environ.get("E2E_FAST_MODEL", "")
        or os.environ.get("FAST_MODEL", "")
        or file_env.get("FAST_MODEL", "")
    )
    code = _resolve_code_tag(file_env)
    think = _normalize_tag(
        os.environ.get("E2E_THINK_MODEL", "")
        or os.environ.get("THINK_MODEL", "")
        or file_env.get("THINK_MODEL", "")
    )
    return fast, code, think


def router_lane_ready() -> tuple[bool, str]:
    """Suite bar: distinct fast and code tags (see docs/TESTING.md). Think is optional."""
    fast, code, think = resolve_router_tags()
    if not fast:
        return (
            False,
            "Router e2e requires FAST_MODEL (or E2E_FAST_MODEL) in local-llm.env — "
            "e.g. qwen2.5-coder:7b. Falling back to llama3.2:3b alone is not a router test.",
        )
    if not code:
        return (
            False,
            "Router e2e requires CODE_MODEL or HEAVY_MODEL (or E2E_* variants) in local-llm.env — "
            "e.g. qwen3.6:27b-q4_K_M. Do not rely on E2E_OLLAMA_MODEL for the code tier.",
        )
    if fast == code:
        return (
            False,
            f"Router e2e requires different fast and code models (both are {fast!r}).",
        )
    detail = f"fast={fast} code={code}"
    if think:
        detail += f" think={think}"
    return True, detail
