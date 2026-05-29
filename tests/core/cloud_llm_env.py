"""Load cloud-llm.env for opt-in cloud LLM pytest (no secrets in repo)."""

from __future__ import annotations

import os
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_cloud_llm_env() -> dict[str, str]:
    path = _repo_root() / "cloud-llm.env"
    if not path.is_file():
        return {}
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        if "=" not in trimmed:
            continue
        key, _, value = trimmed.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            out[key] = value
    return out


def apply_cloud_llm_env() -> None:
    for key, value in load_cloud_llm_env().items():
        os.environ.setdefault(key, value)


def cloud_llm_configured() -> bool:
    apply_cloud_llm_env()
    key = (os.environ.get("OPENAI_API_KEY") or os.environ.get("AZURE_API_KEY") or "").strip()
    if not key:
        return False
    if (os.environ.get("AZURE_API_KEY") or "").strip():
        return bool((os.environ.get("AZURE_API_BASE") or "").strip())
    return True


def resolve_cloud_vision_model() -> str:
    apply_cloud_llm_env()
    raw = (
        os.environ.get("E2E_VISION_MODEL")
        or os.environ.get("E2E_OLLAMA_MODEL")
        or os.environ.get("OPENAI_MODEL")
        or "openai/gpt-4o-mini"
    ).strip()
    from llm_ollama import vision_model_from_tag

    return vision_model_from_tag(raw)
