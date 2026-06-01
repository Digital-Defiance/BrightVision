"""Whether opt-in cloud-llm suite step can run (no secrets logged)."""

from __future__ import annotations

import os
from pathlib import Path

from bright_vision_core.test_suite.timing import repo_root


def _load_cloud_llm_env_file() -> dict[str, str]:
    path = repo_root() / "cloud-llm.env"
    if not path.is_file():
        return {}
    out: dict[str, str] = {}
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


def cloud_llm_configured() -> bool:
    """True when API key + (for Azure) base URL are available."""
    file_env = _load_cloud_llm_env_file()
    key = (
        os.environ.get("OPENAI_API_KEY")
        or os.environ.get("AZURE_API_KEY")
        or file_env.get("OPENAI_API_KEY")
        or file_env.get("AZURE_API_KEY")
        or ""
    ).strip()
    if not key:
        return False
    azure_key = (os.environ.get("AZURE_API_KEY") or file_env.get("AZURE_API_KEY") or "").strip()
    if azure_key:
        base = (os.environ.get("AZURE_API_BASE") or file_env.get("AZURE_API_BASE") or "").strip()
        return bool(base)
    return True


def cloud_llm_env_file_present() -> bool:
    return (repo_root() / "cloud-llm.env").is_file()
